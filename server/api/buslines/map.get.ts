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

    // 优化：一次批量查出所有线路的站点，避免 N+1 查询
    let busstops: any[] = []
    if (lines.length) {
      // 动态生成 IN 占位符
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

    const result = lines.map((line) => {
      // 去掉冗余的 bus_id 字段
      const stops = (stopsByLine.get(line.id) || []).map(({ bus_id, ...rest }) => rest)
      return { ...line, busstops: stops }
    })

    return { data: result, total: result.length, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, code: 500, msg: String(error) }
  }
})
