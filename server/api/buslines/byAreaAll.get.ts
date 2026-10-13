// 地图用：某个区域（含下级区县）的**全量**线路，供地图一次性渲染。
//
// 与 byArea.get.ts 的分工：
//   · byArea   —— 给列表用：分页、字段全（含城市、票价、时间等）、polyline 原样（展开行要显示坐标串）
//   · byAreaAll —— 给地图用：分批、只带出图需要的字段、服务端抽稀
//
// 为什么要分批而不是一次给全：一条省级查询可能要几千条（北京 4120 条），
// 一次发完既慢又容易中途失败，分批则能边收边画、显示进度、随时中止 ——
// 和 /api/buslines/map 那套做法保持一致。
import { simplifyPolyline } from '../../utils/geoSimplify'

// 递归收集该区域下的所有「区县级」adcode（映射表只落最细一层，省/市要展开）
// depth 是兜底：数据里万一出现父子环，不加限制会一直递归下去
const SUBTREE = `
  WITH RECURSIVE tree(adcode, level, depth) AS (
    SELECT adcode, level, 0 FROM city_codes WHERE adcode = ?
    UNION ALL
    SELECT c.adcode, c.level, t.depth + 1
    FROM city_codes c JOIN tree t ON c.parent_adcode = t.adcode
    WHERE t.depth < 8
  )
`

export default defineEventHandler((event) => {
  try {
    const query = getQuery(event)
    const adcode = String(query.adcode ?? '').trim()
    if (!adcode) return { code: 400, msg: 'adcode 不能为空', data: [], total: 0 }

    const offset = Math.max(0, Number(query.offset) || 0)
    const limit = Math.min(300, Math.max(1, Number(query.limit) || 100))
    // 出图抽稀容差（米）。默认 20m：比列表用的原样粗、比缩略图细，
    // 前端可以按需要调大（画全省时调大能明显提速）。
    const epsilon = Math.min(300, Math.max(5, Number(query.epsilon) || 20))

    const db = getDb()

    const subDists = db
      .prepare(`${SUBTREE} SELECT adcode FROM tree WHERE level = 'district'`)
      .all(adcode)
      .map((r: any) => String(r.adcode))

    if (!subDists.length) {
      return { code: 200, msg: 'ok', total: 0, offset, limit, epsilon, done: true, data: [] }
    }

    const inList = subDists.map(() => '?').join(',')

    const { total } = db
      .prepare(`SELECT COUNT(DISTINCT bus_id) AS total FROM bus_line_area WHERE adcode IN (${inList})`)
      .get(...subDists) as any

    // ORDER BY l.name, l.id：必须带一个唯一列兜底。
    // 只按 name 排的话，同名的正/反向线路在两次查询间顺序不保证一致，
    // 分页就会出现「某条重复出现、另一条永远看不到」这种鬼打墙。
    const rows = db
      .prepare(`
        SELECT l.id, l.name, l.uicolor, l.polyline, l.start_stop, l.end_stop, l.direc,
               COUNT(*)        AS areaCount,
               SUM(a.stop_num) AS stopNum,
               MAX(a.is_start) AS isStart,
               MAX(a.is_end)   AS isEnd
        FROM bus_line_area a
        JOIN bus_lines l ON l.id = a.bus_id
        WHERE a.adcode IN (${inList})
        GROUP BY a.bus_id
        ORDER BY l.name, l.id
        LIMIT ? OFFSET ?
      `)
      .all(...subDists, limit, offset) as any[]

    const data = rows.map((line: any) => ({
      id: line.id,
      name: line.name,
      uicolor: line.uicolor,
      start_stop: line.start_stop,
      end_stop: line.end_stop,
      direc: line.direc, // 给前端做正/反向去重（沿用 /map 那套）
      areaCount: line.areaCount,
      stopNum: line.stopNum,
      isStart: line.isStart,
      isEnd: line.isEnd,
      // 入库不抽稀（保留精度），出图时才抽 —— 与 /api/buslines/map 同一套口径
      polyline: simplifyPolyline(line.polyline || '', epsilon, 5),
    }))

    return {
      code: 200,
      msg: 'ok',
      total,
      offset,
      limit,
      epsilon,
      done: offset + rows.length >= total,
      data,
    }
  } catch (error) {
    return { code: 500, msg: String(error), data: [], total: 0 }
  }
})
