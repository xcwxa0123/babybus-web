// 待补边界的行政区清单：只回 adcode / name / level，给前端循环任务排队用。
//
// 默认只给「还没有边界」的行 —— 任务因此天然可断点续跑：跑一半断了、关了页面、
// 甚至被高德掐了配额，下次点「开始爬取」都会自动跳过已经补好的，接着往下跑。
//
// 排序按层级从粗到细：中途被打断时，先把国家 / 省 / 市这些骨架补完，
// 比随机拿到一堆区县有用（地图上先有轮廓，再看细节）。
// 注意 level 为空的是「中华人民共和国」那一行，按最粗的排在最前面。
export default defineEventHandler((event) => {
  try {
    const query = getQuery(event)
    const includeFilled = query.includeFilled === '1' || query.includeFilled === 'true'

    const where: string[] = ["adcode IS NOT NULL", "adcode <> ''"]
    if (!includeFilled) where.push("(polyline IS NULL OR polyline = '')")

    const data = getDb().prepare(`
      SELECT adcode, name, level, citycode FROM city_codes
      WHERE ${where.join(' AND ')}
      ORDER BY CASE level
        WHEN 'province' THEN 1
        WHEN 'city'     THEN 2
        WHEN 'district' THEN 3
        WHEN 'street'   THEN 4
        ELSE 0
      END, adcode
    `).all()

    return { data, total: data.length, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, code: 500, msg: String(error) }
  }
})
