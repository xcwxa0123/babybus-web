// 行政区边界的「出图」工具：把库里存的环处理成浏览器能直接画的形式。
//
// 和 geo.ts 的分工：geo.ts 管几何判断（点在不在环内），不关心体积；
// 这里只管「画出来」——核心是抽稀，外加形状信息（质心、包围盒）。
// 坐标系与全站一致：数据来自高德，统一 GCJ-02，这里不做任何转换。
//
// 关于「环」：库里用 ; 分隔点、| 分隔环，首尾点相同（闭合）。
// 多环绝大多数是岛屿 / 群岛（实测浙江 563 环 = 舟山群岛、福建 421 环 = 海岛、
// 三沙市 256 环 = 南海诸岛），语义是并集，每个环都要画出来。
// 真正「外环套内环」的洞在这批数据里基本不存在，不特殊处理。
import { type Bbox, type Ring, bboxOfRings } from './geo'
import { rdp } from './geoSimplify'

// 抽稀容差（米）。定法是「一个像素」原则：容差 ≈ 该层级平时的观看缩放下 1px 代表的距离
// （z=4 → 1px≈8km，z=7 → ≈1.2km，z=9 → ≈300m，z=11 → ≈80m）。
//
// 起点不是这个，是实测：2000m 那版初始视图仍有 2.3MB，而 40m 版画 16 个区县要 770KB ——
// 都是"看得比屏幕能显示的还清楚"，纯浪费。库里原始数据更夸张：
// 全国 3.4MB、省平均 475KB（最大 1.0MB）、市平均 120KB、区县平均 35KB。
export const EPSILON = {
    overview: 8000, // 初始视图（z≈4）：看得出轮廓就够
    province: 1200,
    city: 300,
    district: 80,
} as const

export type Precision = keyof typeof EPSILON

// 按层级取容差。层级认不出来时按区县级算（宁可细一点，别把形状抽没了）
export function epsilonFor(level: string | null | undefined, precision: Precision = 'detail'): number {
    if (precision === 'overview') return EPSILON.overview
    return EPSILON[(level ?? '') as keyof typeof EPSILON] ?? EPSILON.district
}

// 扁平数组 [lng0,lat0,lng1,lat1,...] ↔ [[lng,lat],...]
function toPoints(ring: Ring): [number, number][] {
    const pts: [number, number][] = []
    for (let i = 0; i + 1 < ring.length; i += 2) pts.push([ring[i] as number, ring[i + 1] as number])
    return pts
}

// 输出统一保留 5 位小数（≈1.1m），和 geoSimplify 的口径一致，顺手省掉一位数字
function toFlat(pts: [number, number][]): Ring {
    const out: number[] = []
    for (const p of pts) out.push(Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5)
    return out
}

// 经纬度 → 近似米制平面（与 geoSimplify 同一套换算，量级保持一致）
function toXY(p: [number, number]): [number, number] {
    return [p[0] * 88600, p[1] * 111000]
}

// 闭合环抽稀。
//
// 不能直接把整个环丢给 rdp：rdp 以「首尾点连线」为基准，而闭合环首尾是同一个点，
// 基准退化成一点，结果不是抽稀而是「保留所有离起点足够远的点」，形状还可能翻。
// 所以先把环从「离起点最远的点」切成两段开放折线，各自抽稀后再接回去并重新闭合。
export function simplifyRing(ring: Ring, epsilon: number): Ring {
    const pts = toPoints(ring)
    if (pts.length < 8) return ring.slice() // 点本来就少的小岛，别动它

    // 去掉与首点重复的尾点，得到开放点列
    const first = pts[0] as [number, number]
    const last = pts[pts.length - 1] as [number, number]
    if (first[0] === last[0] && first[1] === last[1]) pts.pop()
    if (pts.length < 8) return ring.slice()

    // 离首点最远的点作为切分点
    const [x0, y0] = toXY(first)
    let far = 1
    let best = -1
    for (let i = 1; i < pts.length; i++) {
        const [x, y] = toXY(pts[i] as [number, number])
        const d = (x - x0) * (x - x0) + (y - y0) * (y - y0)
        if (d > best) {
            best = d
            far = i
        }
    }

    const left = rdp(pts.slice(0, far + 1), epsilon)
    const right = rdp(pts.slice(far), epsilon)
    const merged = left.concat(right.slice(1))
    const head = merged[0] as [number, number]
    merged.push([head[0], head[1]]) // 重新闭合
    return toFlat(merged)
}

// 整块边界（多个环）抽稀。抽稀后退化成点/线的碎环直接丢掉（成不了面）。
export function simplifyRings(rings: Ring[], epsilon: number): Ring[] {
    const out: Ring[] = []
    for (const ring of rings) {
        const simplified = simplifyRing(ring, epsilon)
        if (simplified.length >= 6) out.push(simplified)
    }
    return out
}

// 鞋带公式，返回环的面积（绝对值；只用来比大小，不关心方向）
export function ringArea(ring: Ring): number {
    let sum = 0
    const n = ring.length / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
        sum += (ring[j * 2] as number) * (ring[i * 2 + 1] as number)
            - (ring[i * 2] as number) * (ring[j * 2 + 1] as number)
    }
    return Math.abs(sum / 2)
}

// 出图用的「中心点」：取最大环的面积质心。
//
// 不用包围盒中心：浙江这种群岛省，563 个环把包围盒撑到整个东海，
// 中心会落在海里 —— 标签和初始视野都会偏掉。
// 质心算不出来时（退化环）再退回包围盒中心。
export function centerOfRings(rings: Ring[]): [number, number] | null {
    let bestRing: Ring | null = null
    let bestArea = -1
    for (const ring of rings) {
        const area = ringArea(ring)
        if (area > bestArea) {
            bestArea = area
            bestRing = ring
        }
    }

    if (bestRing) {
        let cx = 0
        let cy = 0
        let cross2 = 0
        const n = bestRing.length / 2
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = bestRing[i * 2] as number
            const yi = bestRing[i * 2 + 1] as number
            const xj = bestRing[j * 2] as number
            const yj = bestRing[j * 2 + 1] as number
            const cross = xj * yi - xi * yj
            cross2 += cross
            cx += (xj + xi) * cross
            cy += (yj + yi) * cross
        }
        if (cross2 !== 0) return [cx / (3 * cross2), cy / (3 * cross2)]
    }

    const box = bboxOfRings(rings)
    return box ? [(box.minLng + box.maxLng) / 2, (box.minLat + box.maxLat) / 2] : null
}

// 出图用的环：返回**扁平数组** [lng0,lat0,lng1,lat1,...]，而不是 [[lng,lat],...]。
//
// 同样的点集，扁平数组在 JSON 里少一层方括号，实测能省两三成体积。
// AMap 的 Polygon 要的是嵌套格式，由前端转一次（一个 map 的事）。
export function ringsToFlat(rings: Ring[]): number[][] {
    return rings.map((ring) => ring.slice())
}

// 包围盒 → [minLng, minLat, maxLng, maxLat]，前端 fitBounds 用
export function bboxToArray(box: Bbox | null): number[] | null {
    return box ? [box.minLng, box.minLat, box.maxLng, box.maxLat] : null
}
