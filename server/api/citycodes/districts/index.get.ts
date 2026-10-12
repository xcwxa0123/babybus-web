// 行政区列表（管理页用）
// 注意：polyline 很长，列表只回「点数」，正文由 [id].get.ts 单条取
export default defineEventHandler((event) => {
  try {
    const db = getDb()
    const query = getQuery(event)

    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))

    const name = (query.name as string)?.trim()
    const adcode = (query.adcode as string)?.trim()
    const level = (query.level as string)?.trim()
    const parentAdcode = (query.parentAdcode as string)?.trim()

    const whereParts: string[] = []
    const params: any[] = []
    if (name) {
      whereParts.push('c.name LIKE ?')
      params.push(`${name}%`)
    }
    if (adcode) {
      whereParts.push('c.adcode LIKE ?')
      params.push(`${adcode}%`)
    }
    if (level) {
      whereParts.push('c.level = ?')
      params.push(level)
    }
    if (parentAdcode) {
      whereParts.push('c.parent_adcode = ?')
      params.push(parentAdcode)
    }
    const where = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : ''

    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM city_codes c ${where}`).get(...params) as any

    // 全局统计：已录入边界的区域数（不受筛选影响）
    const { withBoundary } = db
      .prepare(`SELECT COUNT(*) AS withBoundary FROM city_codes WHERE polyline IS NOT NULL AND polyline <> ''`)
      .get() as any

    // parentName 用相关子查询而不是 JOIN：adcode 在表里不唯一，JOIN 会造成行翻倍
    // 点数用逗号数量算——每个点恰好一个逗号，比数分号更准（多环时数分号会少算）
    const rows = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.adcode,
        c.citycode,
        c.parent_adcode AS parentAdcode,
        c.level,
        (SELECT p.name FROM city_codes p WHERE p.adcode = c.parent_adcode LIMIT 1) AS parentName,
        (LENGTH(COALESCE(c.polyline, '')) - LENGTH(REPLACE(COALESCE(c.polyline, ''), ',', ''))) AS polyPoints
      FROM city_codes c
      ${where}
      ORDER BY c.adcode IS NULL, c.adcode
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize)

    return { data: rows, total, withBoundary, page, pageSize, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, withBoundary: 0, page: 1, pageSize: 20, code: 500, msg: String(error) }
  }
})
