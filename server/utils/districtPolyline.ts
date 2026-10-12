// 按 adcode 从高德补一条行政区边界并入库。
//
// 为什么抽成 util 而不是写在路由里：路由只做参数校验与转发，取数 / 清洗 / 落库都在这里。
// 这样「补一条边界」这件事只有一个实现，前端循环任务、以后可能有的批量入口都走它。
import { normalizeAdcode, normalizePolyline } from './district'

// 高德里属于「配额 / 权限」类的 infocode：碰到这些要停下整个任务，
// 而不是继续把剩下的几百个请求也打光——那些请求既不会成功，还可能拖长封禁。
const QUOTA_INFOCODES = new Set([
    '10003', // 访问已超出日调用量
    '10004', // 单位时间内访问过于频繁
    '10019', // 使用过期的 KEY
    '10020', // 缺少 KEY
    '10021', // 未开通权限 / 服务不存在
    '10044', // 账号维度日调用量超限
])

export type PolylineResult = {
    code: number      // 200 成功 / 204 高德无边界 / 400 参数 / 404 查无 / 409 对不上 / 429 配额 / 502 网络
    msg: string
    quota?: boolean   // 是否属于配额类失败（前端据此决定停不停整个任务）
    name?: string
    points?: number
    saved?: number    // 实际被更新的行数
}

export async function fetchAndSaveDistrictPolyline(rawAdcode: any): Promise<PolylineResult> {
    const adcode = normalizeAdcode(rawAdcode)
    if (!adcode) return { code: 400, msg: 'adcode 不能为空' }

    let result: any
    try {
        // 用 adcode 而不是名称查：重名的区县不少（东城区、鼓楼区…），名称会命中错的那个。
        // subdistrict=0 只取它自己的边界不下钻；extensions=all 才会带 polyline。
        result = await busmapApi().configDistrict(adcode, '0')
    } catch (error) {
        return { code: 502, msg: `请求高德失败：${String(error)}` }
    }

    if (String(result?.status) !== '1') {
        const info = String(result?.infocode ?? '')
        return {
            code: 429,
            quota: QUOTA_INFOCODES.has(info),
            msg: `高德返回 ${info}：${result?.info ?? '未知原因'}`,
        }
    }

    const hit = Array.isArray(result?.districts) ? result.districts[0] : null
    if (!hit) return { code: 404, msg: '高德未返回该 adcode 的行政区' }
    // 高德对查不到的 adcode 会「猜」一个相近的返回，对不上绝不能写，否则会把别的行政区边界抄进来
    if (String(hit.adcode ?? '') !== adcode) {
        return { code: 409, msg: `高德返回的是 ${hit.adcode}（${hit.name}），与请求的 ${adcode} 不一致` }
    }

    const polyline = normalizePolyline(hit.polyline)
    // 高德只对省 / 市 / 区下发边界，街道级通常是空的——这是正常情况，任务继续往下跑
    if (!polyline) return { code: 204, name: String(hit.name ?? ''), msg: '高德未返回边界' }

    const points = polyline.split(',').length - 1
    // adcode 在表里不唯一，同 adcode 的行本来就是同一个行政区，一起补上
    const info = getDb()
        .prepare('UPDATE city_codes SET polyline = ? WHERE adcode = ?')
        .run(polyline, adcode)

    return { code: 200, name: String(hit.name ?? ''), points, saved: info.changes, msg: 'ok' }
}
