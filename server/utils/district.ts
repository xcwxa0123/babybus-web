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
             THEN 1 ELSE 0 END AS hasChildren
      FROM city_codes c
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
