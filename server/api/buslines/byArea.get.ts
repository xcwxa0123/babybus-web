// 按行政区找线路：判断线路的「起点 / 终点」是否落在该行政区的边界内。
//
// 为什么不能拿矩形凑：线路的 bounds 是矩形、区域的包围盒也是矩形，
// 「首末点落在区域包围盒里」会把贴着区域外面走、但矩形罩住了它的线路也算进来。
// 行政区形状越不规则（区县尤甚，还有飞地）误判越多。真多边形已经爬下来了，就按真形状判断。
//
// 性能：整表几千条线路 × 每条两个端点。
// 先用区域包围盒粗筛（纯数值比较，毫秒级），只有通过粗筛的极少数候选才进射线法，
// 所以对「中国」这种十几万个点的边界也不会卡。
//
// 口径：端点在区域内即算命中，hitEnd 标明是起点、终点还是两端都在。
// 同一条走廊的上行 / 下行是两条独立线路（互为 direc），会各自命中一次——
// 做「区域覆盖了多少条线路」这类统计时记得自己按 direc 去重。
import { bboxContains, bboxOfRings, parseLngLat, parseRings, pointInRings } from '../../utils/geo'

// 返回除 polyline 之外的全部字段：polyline 动辄几百个点，
// 命中几十条就是几百 KB，而列表用不上它（要点进详情才需要）。
const LINE_COLUMNS = `
  id, type, name, citycode, start_stop, end_stop, start_time, end_time,
  uicolor, timedesc, distance, loop, status, direc, company,
  basic_price, total_price, bounds, created_at
`

export default defineEventHandler((event) => {
  try {
    const query = getQuery(event)
    const adcode = String(query.adcode ?? '').trim()
    if (!adcode) return { data: [], total: 0, code: 400, msg: 'adcode 不能为空' }

    const db = getDb()
    const area = db
      .prepare(
        `SELECT name, adcode, level, polyline FROM city_codes
         WHERE adcode = ? AND polyline IS NOT NULL AND polyline <> '' LIMIT 1`
      )
      .get(adcode) as any
    if (!area) {
      return { data: [], total: 0, code: 404, msg: '该区域还没有边界，先去「补齐行政区边界」里爬一条' }
    }

    const rings = parseRings(area.polyline)
    const box = bboxOfRings(rings)
    if (!box || !rings.length) {
      return { data: [], total: 0, code: 422, msg: '该区域的边界解析不出多边形' }
    }

    // 每条线路的首末站坐标。
    // 用站点表的真实站台坐标，而不是 polyline 的首尾点：后者是路径端点，
    // 和首末站差几十米（抽样比对过），在边界附近就足以改变结论。
    // 用（bus_id, stop_id, seq）这个主键的前缀 bus_id + seq 取 min/max，走得到索引。
    const ends = db
      .prepare(`
        WITH t AS (
          SELECT bus_id, MIN(seq) AS first_seq, MAX(seq) AS last_seq
          FROM bus_stop_sequences GROUP BY bus_id
        )
        SELECT t.bus_id AS id, sa.location AS startLoc, sb.location AS endLoc
        FROM t
        LEFT JOIN bus_stop_sequences qa ON qa.bus_id = t.bus_id AND qa.seq = t.first_seq
        LEFT JOIN bus_stops sa ON sa.id = qa.stop_id
        LEFT JOIN bus_stop_sequences qb ON qb.bus_id = t.bus_id AND qb.seq = t.last_seq
        LEFT JOIN bus_stops sb ON sb.id = qb.stop_id
      `)
      .all() as any[]

    const hitEnd = new Map<string, 'start' | 'end' | 'both'>()
    for (const row of ends) {
      const id = String(row.id)
      if (hitEnd.has(id)) continue // 同一 (bus_id, seq) 有多条序列时去重
      const start = parseLngLat(row.startLoc)
      const end = parseLngLat(row.endLoc)

      // 先包围盒后射线法：&& 短路，绝大多数线路在第一个条件就被排掉
      const startHit = start
        ? bboxContains(box, start[0], start[1]) && pointInRings(start[0], start[1], rings)
        : false
      const endHit = end
        ? bboxContains(box, end[0], end[1]) && pointInRings(end[0], end[1], rings)
        : false
      if (!startHit && !endHit) continue

      hitEnd.set(id, startHit && endHit ? 'both' : startHit ? 'start' : 'end')
    }

    const ids = [...hitEnd.keys()]
    const rows: any[] = []
    // SQLite 的绑定变量个数有上限（旧版 999），命中一大片时分批查
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      rows.push(
        ...(db
          .prepare(
            `SELECT ${LINE_COLUMNS} FROM bus_lines WHERE id IN (${chunk.map(() => '?').join(',')})`
          )
          .all(...chunk) as any[])
      )
    }

    const data = rows
      .map((r) => ({ ...r, hitEnd: hitEnd.get(String(r.id)) }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))

    return {
      data,
      total: data.length,
      area: { name: area.name, adcode: area.adcode, level: area.level },
      // 把判断依据一起回给前端，免得只有个数字说不清是拿什么算的
      scanned: ends.length,
      rings: rings.length,
      points: rings.reduce((n, r) => n + r.length / 2, 0),
      code: 200,
      msg: 'ok',
    }
  } catch (error) {
    return { data: [], total: 0, code: 500, msg: String(error) }
  }
})
