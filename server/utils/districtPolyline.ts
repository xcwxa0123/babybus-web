// 按 adcode 从高德补一条行政区边界并入库。
//
// 为什么抽成 util 而不是写在路由里：路由只做参数校验与转发，取数 / 清洗 / 落库都在这里。
// 这样「补一条边界」这件事只有一个实现，前端循环任务、以后可能有的批量入口都走它。
import { normalizeAdcode, normalizePolyline } from './district'

// 高德的失败码分两类，处理方式完全相反：
//
//  · 致命类：今天不会好了（配额打光、KEY 无效 / 过期 / 没权限）。
//    继续跑只是把剩下几百个请求也白打光，还可能拖长封禁 —— 必须停整个任务。
//
//  · 限流类：等一下就好。这类是瞬时的，停下整个任务反而可惜 ——
//    交回前端退避重试。（10021 CUQPS_HAS_EXCEEDED_THE_LIMIT 是实测碰到的：
//    连着打几个请求就会撞上，跑到一半被它干掉整条任务太冤。）
//
// 除了下面明确列出的限流码，其它失败码一律当致命处理，判断处有说明。
const THROTTLE_INFOCODES = new Set([
    '10004', // ACCESS_TOO_FREQUENT              单位时间访问过于频繁
    '10021', // CUQPS_HAS_EXCEEDED_THE_LIMIT     并发超限
])

export type PolylineResult = {
    code: number       // 200 成功 / 204 高德无边界 / 400 参数 / 404 查无 / 409 对不上 / 429 致命 / 502 网络 / 503 限流
    msg: string
    quota?: boolean    // 致命类失败（前端据此停掉整个任务）
    throttle?: boolean // 限流类失败（前端退避重试，不停任务）
    name?: string
    points?: number
    saved?: number     // 实际被更新的行数
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
        const msg = `高德返回 ${info}：${result?.info ?? '未知原因'}`
        // 限流类单独给一个码：调用方要退避重试，而不是当成失败收下或停掉任务
        if (THROTTLE_INFOCODES.has(info)) return { code: 503, throttle: true, msg }
        // 其余一律按致命处理，包括认不出来的码。
        // 理由：这是个吃配额的批量任务，宁可按「停下来看一眼」处理（任务可断点续跑，
        // 代价只是要点一次继续），也好过在白打的路上把剩下几千个请求走完。
        // 常见致命码：10003/10009/10044 配额打光，10001/10005/10008/10019/10020 key 有问题，
        // 10002/10013 服务不可用。
        return { code: 429, quota: true, msg }
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
