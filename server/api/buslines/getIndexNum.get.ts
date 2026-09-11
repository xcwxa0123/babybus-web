export default defineEventHandler(async (event) => {
  try {
    const db = getDb()
    // 总量
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM bus_lines`).get() as any
    // 已拉取总量：status = 2（已完成）的城市所覆盖的区县数（去重累加，不分组）
    const { adcode_count } = db.prepare(`
        SELECT COUNT(DISTINCT c.adcode) AS adcode_count
            FROM done_num_citycode d
            LEFT JOIN city_codes c ON c.citycode = d.citycode
            WHERE d.status = 2;`
    ).get() as any
    const body = { data: { total, adcodeCount: adcode_count }, code: 200, msg: 'ok' }
    return body
  } catch (error) {
    return { data: { total: 0, adcodeCount: 0 }, code: 500, msg: String(error) }
  }
})
