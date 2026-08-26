// polyline 抽稀工具（Ramer-Douglas-Peucker 算法）
// 用于在返回给前端前压缩线路坐标点数，减少传输体积
// 说明：入库时不抽稀，查询返回时抽稀，保证数据精度不丢失

// 经纬度转近似米制平面坐标
function lngToX(lng: number): number { return lng * 88600 }
function latToY(lat: number): number { return lat * 111000 }

// 点到线段距离（米）
function pointToSegmentDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(x - ax, y - ay)
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

// RDP 抽稀核心（对 [[lng,lat],...] 点数组）
function rdp(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length < 3) return points

  const [ax, ay] = [lngToX(points[0]![0]), latToY(points[0]![1])]
  const [bx, by] = [lngToX(points[points.length - 1]![0]), latToY(points[points.length - 1]![1])]

  let maxDist = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToSegmentDist(lngToX(points[i]![0]), latToY(points[i]![1]), ax, ay, bx, by)
    if (d > maxDist) { maxDist = d; index = i }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon)
    const right = rdp(points.slice(index), epsilon)
    return left.concat(right.slice(1))
  }
  return [points[0]!, points[points.length - 1]!]
}

/**
 * 对 polyline 字符串抽稀。
 * 格式："lng,lat;lng,lat;..."，可能分多段（用 | 分隔，公交线路通常单段）
 * @param polylineStr 原始 polyline 字符串
 * @param epsilon 容差（米），越大越粗略。公交线路建议 10-20
 * @param decimals 坐标保留小数位，建议 5
 */
export function simplifyPolyline(polylineStr: string, epsilon = 12, decimals = 5): string {
  if (!polylineStr) return polylineStr

  return polylineStr
    .split('|')
    .filter((block) => block !== '')
    .map((block) => {
      const pts = block
        .split(';')
        .filter((p) => p !== '')
        .map((p) => {
          const [lng, lat] = p.split(',').map(Number)
          return [lng, lat] as [number, number]
        })
      const simplified = rdp(pts, epsilon)
      return simplified
        .map(([lng, lat]) => `${lng.toFixed(decimals)},${lat.toFixed(decimals)}`)
        .join(';')
    })
    .join('|')
}
