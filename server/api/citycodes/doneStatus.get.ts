export default defineEventHandler((event) => {
  try {
    const db = getDb()
    const query = getQuery(event)

    // 分页参数（默认 page=1, pageSize=20，最多 200）
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))
    const citycode = (query.citycode as string)?.trim()


    const where = citycode ? `WHERE citycode = ?` : ''
    const params = []
    if (citycode) {
        params.push(citycode)
    }
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM done_num_citycode ${where}`).get(...params) as any

    params.push(pageSize)
    params.push((page - 1) * pageSize)
    // 总数（用于分页）

    // 当前页数据
    const rows = db.prepare(`SELECT 
        citycode, 
        done_num AS doneNum,
        status, 
        total_num AS totalNum, 
        updated_at AS updatedAt 
        FROM done_num_citycode ${where} ORDER BY citycode IS NULL, citycode LIMIT ? OFFSET ?`)
    .all(...params)

    return { data: rows, total, page, pageSize, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, page: 1, pageSize: 20, code: 500, msg: String(error) }
  }
})
