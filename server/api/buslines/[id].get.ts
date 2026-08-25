export default defineEventHandler((event) => {
  try {
    const id = getRouterParam(event, 'id')
    const db = getDb()

    const line = db.prepare('SELECT * FROM bus_lines WHERE id = ?').get(id)
    if (!line) {
      return { data: [], code: 404, msg: '线路不存在' }
    }
    // 联表查询，按 seq 排序还原有序站点数组
    const busstops = db.prepare(`
      SELECT s.id, s.name, s.location, b.seq AS sequence
      FROM bus_stop_sequences b
      JOIN bus_stops s ON s.id = b.stop_id
      WHERE b.bus_id = ?
      ORDER BY b.seq ASC
    `).all(id)

    ;(line as any).busstops = busstops
    return { data: line, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], code: 500, msg: String(error) }
  }
})
