export default defineEventHandler((event) => {
  try {
    const id = getRouterParam(event, 'id')
    const db = getDb()

    const result = db.prepare('DELETE FROM bus_lines WHERE id = ?').run(id)
    if (result.changes === 0) {
      return { data: {}, code: 404, msg: '线路不存在' }
    }
    // bus_stop_sequences 因外键 ON DELETE CASCADE 自动清理；
    // 但需同时清理不再被任何线路引用的孤立站点（可选优化）
    db.prepare(`
      DELETE FROM bus_stops
      WHERE id NOT IN (SELECT DISTINCT stop_id FROM bus_stop_sequences)
    `).run()

    return { data: { id }, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: {}, code: 500, msg: String(error) }
  }
})
