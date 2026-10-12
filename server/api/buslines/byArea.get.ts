// 按行政区查线路 —— 读「线路 → 行政区」中间表（bus_line_area），不再实时做几何判断。
//
// 口径：**站点**，即「这条线路在这个区域内有没有站」。
// 不算路径：路径会包含车开过但不停的路段（高架、隧道、跨区不停车），
// 那些区乘客上下不了车，算进去是假信息。中间表由 areaMapping.ts 统一生成。
//
// 支持任意层级：传省 / 市 / 区县都行。传省级时会把该省下**所有区县**的线路汇总去重，
// 所以「查山东省的线路」不需要前端自己去遍历各级 —— 递归在 SQL 里做。

// 列表字段：与 /api/buslines 保持一致（含 polyline，前端展开行要显示坐标串）
const LINE_COLUMNS = `
  l.id, l.type, l.name, l.polyline, l.citycode, l.start_stop, l.end_stop,
  l.start_time, l.end_time, l.uicolor, l.timedesc, l.distance, l.loop, l.status,
  l.direc, l.company, l.basic_price, l.total_price, l.bounds, l.created_at
`

// 递归收集该区域下的所有「区县级」adcode。
// 中间表只落最细一层，所以省 / 市要往下展开成区县才能对上。
// depth 是兜底：数据里万一出现父子环，不加限制会一直递归下去。
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
    if (!adcode) return { data: [], total: 0, code: 400, msg: 'adcode 不能为空' }

    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))

    const db = getDb()
    const area = db
      .prepare('SELECT adcode, name, level, polyline FROM city_codes WHERE adcode = ? LIMIT 1')
      .get(adcode) as any
    if (!area) return { data: [], total: 0, code: 404, msg: '没有这个行政区' }

    // 该区域下有边界的区县（中间表只认这些；没爬边界的区县自然查不出线路）
    const subDists = db
      .prepare(`${SUBTREE} SELECT adcode FROM tree WHERE level = 'district'`)
      .all(adcode)
      .map((r: any) => String(r.adcode))

    const areaInfo = {
      adcode: String(area.adcode),
      name: area.name,
      level: area.level,
      hasBoundary: !!(area.polyline && String(area.polyline).length),
      districts: subDists.length,
    }

    if (!subDists.length) {
      return { data: [], total: 0, page, pageSize, area: areaInfo, code: 200, msg: 'ok' }
    }

    const inList = subDists.map(() => '?').join(',')

    // 一条线路可能同时命中范围内的多个区县，所以要按线路聚合：
    //   areaCount 命中几个区县（传省 / 市时才有信息量）
    //   stopNum   在该范围内的站点合计
    //   isStart / isEnd 该范围内是否含始发 / 终到区
    const { total } = db
      .prepare(
        `SELECT COUNT(DISTINCT bus_id) AS total FROM bus_line_area WHERE adcode IN (${inList})`
      )
      .get(...subDists) as any

    const data = db
      .prepare(`
        SELECT ${LINE_COLUMNS},
               COUNT(*)        AS areaCount,
               SUM(a.stop_num) AS stopNum,
               MAX(a.is_start) AS isStart,
               MAX(a.is_end)   AS isEnd
        FROM bus_line_area a
        JOIN bus_lines l ON l.id = a.bus_id
        WHERE a.adcode IN (${inList})
        GROUP BY a.bus_id
        ORDER BY l.name
        LIMIT ? OFFSET ?
      `)
      .all(...subDists, pageSize, (page - 1) * pageSize) as any[]

    return { data, total, page, pageSize, area: areaInfo, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], total: 0, code: 500, msg: String(error) }
  }
})
