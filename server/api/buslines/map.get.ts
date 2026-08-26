// 批量获取线路渲染数据（含 polyline 和站点），支持分页，用于地图渲染
import { simplifyPolyline } from '../../utils/geoSimplify'

export default defineEventHandler((event) => {
  try {
    // 前期拉数据期间做12小时缓存，数据拉完了就换ETags逻辑
    setHeader(event, 'Cache-Control', 'public, max-age=43200')
    const db = getDb()
    const query = getQuery(event)
    const keyword = (query.keyword as string)?.trim() || ''

    // 分页参数（默认 page=1, pageSize=20）
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))

    // 支持按名称模糊匹配
    let where = ''
    const params: any[] = []
    if (keyword) {
      where = ` WHERE name LIKE ?`
      params.push(`%${keyword}%`)
    }

    // 总量（用于进度条和分页）
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM bus_lines ${where}`).get(...params) as any

    // 当前页线路
    const lines = db.prepare(`
      SELECT id, name, type, uicolor, polyline, citycode, start_stop, end_stop, direc, start_time, end_time, distance, basic_price, total_price, timedesc
      FROM bus_lines ${where} ORDER BY name LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize) as any[]

    // 批量查出当前页线路的站点（避免 N+1）
    let busstops: any[] = []
    if (lines.length) {
      const placeholders = lines.map(() => '?').join(',')
      const ids = lines.map((l) => l.id)
      busstops = db.prepare(`
        SELECT b.bus_id, s.id, s.name, s.location, b.seq AS sequence
        FROM bus_stop_sequences b
        JOIN bus_stops s ON s.id = b.stop_id
        WHERE b.bus_id IN (${placeholders})
        ORDER BY b.bus_id, b.seq ASC
      `).all(...ids) as any[]
    }

    // 内存分组：按 bus_id 把站点挂到对应线路上
    const stopsByLine = new Map<string, any[]>()
    for (const stop of busstops) {
      const arr = stopsByLine.get(stop.bus_id)
      if (arr) arr.push(stop)
      else stopsByLine.set(stop.bus_id, [stop])
    }

    // 返回前对 polyline 做抽稀，减少传输体积（入库不抽稀，保持精度）
    const result = lines.map((line) => {
      const stops = (stopsByLine.get(line.id) || []).map(({ bus_id, ...rest }) => rest)
      return { ...line, polyline: simplifyPolyline(line.polyline || '', 12, 5), busstops: stops }
    })

    return { data: result, total, page, pageSize, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, page: 1, pageSize: 20, code: 500, msg: String(error) }
  }
})
