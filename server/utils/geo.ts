// 几何判断：行政区边界是多边形（环内用 ; 分隔点、环间用 | 分隔环）。
//
// 这里只放纯函数、不碰数据库，一是好单独验证，二是调用方可以先把多边形读进内存反复用。
//
// 坐标系：全站数据都来自高德，统一是 GCJ-02。同一个坐标系下比较才成立——
// 一旦哪天的坐标来自别处（比如 GPS 原始数据是 WGS-84），整体会偏几百米，
// 边界判断结果就全错了，所以这里不做任何坐标转换，也不该有。
//
// 点用扁平数组 [lng0, lat0, lng1, lat1, ...] 表示，而不是 {lng, lat} 对象数组：
// 省级边界动辄几万个点，扁平数组少一层指针跳转，判断快得多。

export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number }
export type Ring = number[]

// ── 解析 ──

// 单个 "lng,lat"，解析不出来返回 null（空串、缺一半、非数字都算）
export function parseLngLat(raw: any): [number, number] | null {
    const text = String(raw ?? '').trim()
    const comma = text.indexOf(',')
    if (comma < 0) return null
    const lngText = text.slice(0, comma).trim()
    const latText = text.slice(comma + 1).trim()
    // 不能只判断 Number.isFinite：Number('') === 0 且是有限值，会把空串当成 (0,0)
    if (!lngText || !latText) return null
    const lng = Number(lngText)
    const lat = Number(latText)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    return [lng, lat]
}

// 边界点串 → 环数组。少于 3 个点的环成不了面，直接丢掉
export function parseRings(polyline: any): Ring[] {
    const rings: Ring[] = []
    for (const chunk of String(polyline ?? '').split('|')) {
        const flat: number[] = []
        for (const pair of chunk.split(';')) {
            const point = parseLngLat(pair)
            if (point) flat.push(point[0], point[1])
        }
        if (flat.length >= 6) rings.push(flat)
    }
    return rings
}

// ── 包围盒 ──

export function bboxOfRings(rings: Ring[]): Bbox | null {
    if (!rings.length) return null
    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i += 2) {
            const lng = ring[i] as number
            const lat = ring[i + 1] as number
            if (lng < minLng) minLng = lng
            if (lng > maxLng) maxLng = lng
            if (lat < minLat) minLat = lat
            if (lat > maxLat) maxLat = lat
        }
    }
    return { minLng, minLat, maxLng, maxLat }
}

export function bboxContains(box: Bbox, lng: number, lat: number): boolean {
    return lng >= box.minLng && lng <= box.maxLng && lat >= box.minLat && lat <= box.maxLat
}

export function bboxIntersects(a: Bbox, b: Bbox): boolean {
    return a.minLng <= b.maxLng && a.maxLng >= b.minLng && a.minLat <= b.maxLat && a.maxLat >= b.minLat
}

// ── 精确判断 ──

// 点是否在环内：射线法。从点向右发一条水平射线，数它穿过环边界的次数，奇数为内。
//
// 顶点正好落在射线上时最容易被算两次（相邻两条边各算一次，奇偶就翻了），
// 所以用 (yi > lat) !== (yj > lat) 这种半开区间比较：一条边只有真正「跨过」射线才算数。
// 纬度相同时（水平边）自然被排除，不需要特判。
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
    let inside = false
    const count = ring.length / 2
    for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = ring[i * 2] as number
        const yi = ring[i * 2 + 1] as number
        const xj = ring[j * 2] as number
        const yj = ring[j * 2 + 1] as number
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside
        }
    }
    return inside
}

// 点是否在多边形内：命中任一环即算在内。
//
// 高德的行政区边界用 | 分隔多个环，绝大多数行政区只有一个；
// 多个环一般是「飞地」这类分离的部分，当成并集是对的。
// 真碰上带洞（外环 + 内环）的行政区会误判——那种情况极少，
// 真要处理就得按环的方向（外环顺时针 / 内环逆时针）区分并集与差集，届时再说。
export function pointInRings(lng: number, lat: number, rings: Ring[]): boolean {
    for (const ring of rings) {
        if (pointInRing(lng, lat, ring)) return true
    }
    return false
}
