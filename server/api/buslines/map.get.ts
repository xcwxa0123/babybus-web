// 批量获取线路渲染数据（含 polyline 和站点），用于地图渲染
export default defineEventHandler((event) => {
  try {
    const db = getDb()
    const query = getQuery(event)
    const keyword = (query.keyword as string)?.trim() || ''

    // 支持按名称模糊匹配
    let where = ''
    const params: any[] = []
    if (keyword) {
      where = ` WHERE name LIKE ?`
      params.push(`%${keyword}%`)
    }

    const lines = db.prepare(`
      SELECT id, name, type, uicolor, polyline, citycode, start_stop, end_stop, direc, start_time, end_time, distance, basic_price, total_price, timedesc
      FROM bus_lines ${where} ORDER BY name
    `).all(...params) as any[]

    // 每条线路附带站点（精简：仅 id/name/location/sequence）
    const stopStmt = db.prepare(`
      SELECT s.id, s.name, s.location, b.seq AS sequence
      FROM bus_stop_sequences b
      JOIN bus_stops s ON s.id = b.stop_id
      WHERE b.bus_id = ?
      ORDER BY b.seq ASC
    `)

    const result = lines.map((line) => {
      const busstops = stopStmt.all(line.id)
      return { ...line, busstops }
    })

    return { data: result, total: result.length, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, code: 500, msg: String(error) }
  }
})
