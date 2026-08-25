export default defineEventHandler((event) => {
  try {
    const db = getDb()
    const query = getQuery(event)
    const keyword = (query.keyword as string)?.trim()

    // 分页参数（默认 page=1, pageSize=20，最多 200）
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))

    // 支持按线路名 / 首发站 / 末站模糊搜索
    let where = ''
    const params: any[] = []
    if (keyword) {
      where = ` WHERE name LIKE ? OR start_stop LIKE ? OR end_stop LIKE ?`
      const like = `%${keyword}%`
      params.push(like, like, like)
    }

    // 总数（用于分页）
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM bus_lines ${where}`).get(...params) as any

    // 当前页数据
    const rows = db.prepare(` SELECT * FROM bus_lines ${where} ORDER BY name LIMIT ? OFFSET ? `)
      .all(...params, pageSize, (page - 1) * pageSize)

    return { data: rows, total, page, pageSize, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, page: 1, pageSize: 20, code: 500, msg: String(error) }
  }
})
