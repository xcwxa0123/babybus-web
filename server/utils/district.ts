import type Database from 'better-sqlite3'

// 行政区相关的纯函数：adcode 与边界坐标串的规范化。
// 单独抽出来是为了让「单条编辑」和「批量导入」共用同一套清洗逻辑，避免两处行为不一致。

// adcode：去掉所有空白，空值统一返回 null
export function normalizeAdcode(raw: any): string | null {
    const s = String(raw ?? '').trim().replace(/\s+/g, '')
    return s ? s : null
}

// citycode 规范化：
// 高德在「省级」节点上会把 citycode 返回成数组（一个省对应多个城市电话区号），
// 而表里是单值列——只有一个元素时取它，多个就当作没有（省级本来也没有单一 citycode），
// 否则 String(数组) 会拼出 "0546,0543" 这种垃圾值写进库里。
export function normalizeCitycode(raw: any): string | null {
    if (raw === null || raw === undefined) return null
    if (Array.isArray(raw)) {
        const list = raw.map((x) => String(x ?? '').trim()).filter(Boolean)
        return list.length === 1 ? (list[0] ?? null) : null
    }
    const s = String(raw).trim()
    return s ? s : null
}

// 「线路收录」的汇总补算：给没有 citycode 记录的节点（国家 / 省级）算出一个状态。
//
// 规则（与业务约定一致）：
//   · 任意后代是 进行中(1) 或 已完成(2)  → 进行中
//   · 后代全部都是 已完成(2)            → 已完成
//   · 后代里一个 进行中/已完成 都没有     → 未开始
//
// 做法是从每个「有状态」的节点沿 parent_adcode 往上传播标记，而不是自上而下递归求子树：
// 有状态的节点只有几百个、层级最深四五层，代价远小于全表递归。
// doneNum / totalNum 是「单个城市拉取关键词的进度」，汇总行没有对应值，所以不补（前端据此不显示数字）。
export function computeDerivedDoneStatus(db: Database.Database): Map<string, number> {
    const parents = new Map<string, string>()
    const parentRows = db
        .prepare(`SELECT adcode, parent_adcode AS p FROM city_codes WHERE adcode IS NOT NULL AND adcode <> ''`)
        .all() as any[]
    for (const r of parentRows) {
        const p = String(r.p ?? '')
        if (p && p !== String(r.adcode)) parents.set(String(r.adcode), p)
    }

    const statusRows = db.prepare(`
      SELECT c.adcode AS adcode, d.status AS status
      FROM city_codes c
      JOIN done_num_citycode d ON d.citycode = c.citycode
      WHERE c.adcode IS NOT NULL AND c.adcode <> ''
    `).all() as any[]

    const agg = new Map<string, { statused: boolean; notDone: boolean; active: boolean }>()
    for (const s of statusRows) {
        const status = Number(s.status)
        let cur = parents.get(String(s.adcode))
        let guard = 0
        while (cur && guard++ < 20) { // guard 兜住数据里可能出现的父子环
            const a = agg.get(cur) ?? { statused: false, notDone: false, active: false }
            a.statused = true
            if (status === 0 || status === 1) a.notDone = true
            if (status === 1 || status === 2) a.active = true
            agg.set(cur, a)
            cur = parents.get(cur)
        }
    }

    const out = new Map<string, number>()
    for (const [adcode, a] of agg) {
        if (a.statused && !a.notDone) out.set(adcode, 2) // 后代全是已完成
        else if (a.active) out.set(adcode, 1) // 有进行中 / 已完成
        else out.set(adcode, 0) // 后代都还没动
    }
    return out
}

// 行政区列表 / 子级查询共用的列集合：
// 两个接口字段必须完全一致（前端同一套列渲染），抽出来避免以后加字段时只改了一边。
// where / orderBy 只允许传固定片段（不要拼接用户输入，参数一律走 ? 绑定）。
export function districtSelectSql(
    where = '',
    orderBy = 'ORDER BY c.adcode IS NULL, c.adcode'
): string {
    return `
      SELECT
        c.id,
        c.name,
        c.adcode,
        c.citycode,
        c.parent_adcode AS parentAdcode,
        c.level,
        (SELECT p.name FROM city_codes p WHERE p.adcode = c.parent_adcode LIMIT 1) AS parentName,
        CASE WHEN c.polyline IS NULL OR c.polyline = '' THEN 0
             ELSE LENGTH(c.polyline) - LENGTH(REPLACE(c.polyline, ',', ''))
        END AS polyPoints,
        CASE WHEN EXISTS (SELECT 1 FROM city_codes k WHERE k.parent_adcode = c.adcode)
             THEN 1 ELSE 0 END AS hasChildren,
        -- 线路收录状态来自 done_num_citycode，它按 citycode（电话区号）记录。
        -- citycode 是「城市级」的：同一个城市下的市 / 区县共享同一条记录，
        -- 所以这些行会显示同一个状态——这是刻意为之，不是 join 写错了。
        -- done_num_citycode.citycode 是主键（唯一），LEFT JOIN 不会造成行翻倍。
        d.status    AS doneStatus,
        d.done_num  AS doneNum,
        d.total_num AS totalNum
      FROM city_codes c
      LEFT JOIN done_num_citycode d ON d.citycode = c.citycode
      ${where}
      ${orderBy}
    `
}

// 边界坐标串规范化：
// - 高德返回的边界可能是「环内 ; 分隔、环间 | 分隔」的多面结构，这里保持这个语义不变
// - 点与点之间允许 ; | 换行 制表符 空格 等任意混合分隔，统一成 ;
// - 每对必须是合法的 "lng,lat"（两个有限数），非法点直接丢弃
// - 顺带把 39.990000 压成 39.99，能显著减小体积
export function normalizePolyline(raw: any): string | null {
    const s = String(raw ?? '').trim()
    if (!s) return null

    const rings = s
        .split('|')
        .map((ring) =>
            ring
                .split(/[;\s]+/)
                .map((pair) => {
                    const [lngRaw, latRaw] = pair.split(',')
                    if (!lngRaw || !latRaw) return ''
                    const lng = Number(lngRaw)
                    const lat = Number(latRaw)
                    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return ''
                    return `${lng},${lat}`
                })
                .filter(Boolean)
        )
        .filter((ring) => ring.length > 0)

    return rings.length ? rings.map((ring) => ring.join(';')).join('|') : null
}
