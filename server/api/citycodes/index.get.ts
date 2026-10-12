export default defineEventHandler((event) => {
  try {
    const db = getDb()
    const query = getQuery(event)

    // 分页参数（默认 page=1, pageSize=20，最多 200）
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))

    // 支持按 name / adcode / citycode 模糊搜索（可多字段同时传，取并集按 OR）
    const whereParts: string[] = []
    const params: any[] = []

    const name = (query.name as string)?.trim()
    const adcode = (query.adcode as string)?.trim()
    const citycode = (query.citycode as string)?.trim()

    if (name) {
      whereParts.push('name LIKE ?')
      params.push(`${name}%`)
    }
    if (adcode) {
      whereParts.push('adcode LIKE ?')
      params.push(`${adcode}%`)
    }
    if (citycode) {
      whereParts.push('citycode LIKE ?')
      params.push(`${citycode}%`)
    }

    const where = whereParts.length ? ` WHERE ${whereParts.join(' OR ')}` : ''

    // 总数（用于分页）
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM city_codes ${where}`).get(...params) as any

    // 当前页数据
    // 显式列名而不是 SELECT *：city_codes 后来加了 polyline（一个省的边界就有 30 多万字符），
    // 用 * 会把这么大一坨塞进每次响应里；本接口的调用方（地图页解析 citycode、首页取 total）
    // 都不需要边界，所以这里直接不带它
    const rows = db.prepare(`
      SELECT id, name, adcode, citycode, parent_adcode, level, created_at
      FROM city_codes ${where}
      ORDER BY citycode IS NULL, citycode
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize)

    return { data: rows, total, page, pageSize, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, page: 1, pageSize: 20, code: 500, msg: String(error) }
  }
})
