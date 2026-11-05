export default defineEventHandler((event) => {
  try {
    const db = getDb()
    const query = getQuery(event)

    // 分页参数（默认 page=1, pageSize=20，最多 200）
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))
    const citycode = (query.citycode as string)?.trim()

    const status = (query.status as string)?.trim()
    let where = ''
    const whereParts: string[] = []
    const params: any[] = []

    if(citycode){
      whereParts.push('citycode LIKE ?')
      params.push(`${citycode}%`)
    }

    if (status) {
      whereParts.push(`status = ?`)
      params.push(status)
    }

    if (whereParts.length) {
      where = `WHERE ${whereParts.join(' AND ')}`
    }

    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM done_num_citycode ${where};`).get(...params) as any

    // 总数（用于分页）

    // 当前页数据
    const rowsWhere = whereParts.length
      ? `WHERE ${whereParts.map((part) => part.replace(/^citycode\b/, 'd.citycode').replace(/^status\b/, 'd.status')).join(' AND ')}`
      : ''
    const rows = db.prepare(`SELECT 
        d.citycode,
        (SELECT c.name FROM city_codes c WHERE c.citycode = d.citycode
          ORDER BY CASE c.level WHEN 'city' THEN 0 WHEN 'district' THEN 1 WHEN 'province' THEN 2 ELSE 3 END,
                   c.adcode LIMIT 1) AS cityname,
        done_num AS doneNum,
        d.status,
        total_num AS totalNum,
        updated_at AS updatedAt
        FROM done_num_citycode d ${rowsWhere}
        ORDER BY d.citycode IS NULL, d.citycode LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)

    return { data: rows, total, page, pageSize, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, page: 1, pageSize: 20, code: 500, msg: String(error) }
  }
})
