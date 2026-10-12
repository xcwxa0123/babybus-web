// 重建「站点 → 行政区」与「线路 → 行政区」两张映射表。
//
// 口径（与业务约定一致）：
//   · **只算站点，不算路径**。路径会包含「车开过但不停」的路段（高架、隧道、跨区不停车），
//     那些区乘客上下不了车，算进去只会制造假信息。站点才是乘客真正能上下的位置，
//     所以「这条线路在这个区有没有站」才是要回答的问题。
//   · **首末站不需要单独处理**：它们就是站点序列的 seq=1 与 MAX(seq)。
//     实测 3420 条线路全部如此（117 处名字差异「XX」vs「XX站」已确认全是写法，位置一致）。
//   · **只落最细的区县级**（level = 'district'）。查省 / 市时用 city_codes 的父子关系往上推，
//     实测 3213 个区县的父级链 100% 完整，且与 adcode 前缀零差异。
//
// 分批执行：按「区县」切片，每批处理若干个区县，进度就是已处理区县数 —— 是真的，
// 不是给一个瞬间完成的操作配个假进度条。线路表在最后一批之后用纯 SQL 派生。
import { bboxContains, bboxOfRings, parseLngLat, parseRings, pointInRings } from './geo'

export type BatchResult = {
    total: number              // 有边界的区县总数
    offset: number             // 本批起点
    processed: number          // 本批处理了几个区县
    cleared: boolean           // 本批是否清了表（只有第一批发车时才会）
    finished: boolean          // 全部处理完，线路表已派生
    stopAreas: number          // bus_stop_area 当前行数（累计）
    lineAreas?: number         // finished 时才有
    linesMapped?: number
    linesUnmapped?: number
    multiAreaStops?: number    // 同时落在多个区县的站点数；正常为 0，非 0 说明边界数据有重叠
    ms: number
}

const AREA_SQL = `
  SELECT adcode, level, polyline FROM city_codes
  WHERE level = 'district' AND polyline IS NOT NULL AND polyline <> ''
  ORDER BY adcode
`

// 线路表派生：线路经过的区县 = 它的站点所属区县的并集。
// is_start / is_end 用「组内是否存在 seq 等于全表首 / 末 seq 的行」判断 ——
// 环线的首末站落在同一个区时两列都会是 1，这正是要的（它既是始发也是终到，不是纯途经）。
const DERIVE_SQL = `
  INSERT INTO bus_line_area
    (bus_id, adcode, level, stop_num, first_seq, is_start, is_end, computed_at)
  SELECT
    q.bus_id,
    sa.adcode,
    MIN(sa.level),
    COUNT(DISTINCT q.stop_id),
    MIN(q.seq),
    MAX(CASE WHEN q.seq = t.first_seq THEN 1 ELSE 0 END),
    MAX(CASE WHEN q.seq = t.last_seq  THEN 1 ELSE 0 END),
    datetime('now', 'localtime')
  FROM bus_stop_sequences q
  JOIN bus_stop_area sa ON sa.stop_id = q.stop_id
  JOIN (
    SELECT bus_id, MIN(seq) AS first_seq, MAX(seq) AS last_seq
    FROM bus_stop_sequences GROUP BY bus_id
  ) t ON t.bus_id = q.bus_id
  GROUP BY q.bus_id, sa.adcode
`

export function rebuildAreaMappingBatch(offset = 0, limit = 200): BatchResult {
    const started = Date.now()
    const db = getDb()

    const areaRows = db.prepare(AREA_SQL).all() as any[]
    const total = areaRows.length
    const from = Math.max(0, Math.floor(offset) || 0)
    const to = Math.min(total, from + Math.max(1, Math.floor(limit) || 1))
    const slice = areaRows.slice(from, to)

    // 站点坐标只解析一次。放在区县循环外层：不然每个区县都要把两万多个
    // 「lng,lat」字符串重新 split + Number 一遍，白白多花几十倍时间。
    const points: { id: string; lng: number; lat: number }[] = []
    for (const s of db
        .prepare("SELECT id, location FROM bus_stops WHERE location IS NOT NULL AND location <> ''")
        .all() as any[]) {
        const p = parseLngLat(s.location)
        if (p) points.push({ id: String(s.id), lng: p[0], lat: p[1] })
    }

    let cleared = false
    const write = db.transaction(() => {
        if (from === 0) {
            // 从第 0 批出发 = 一次全新的完整重建，先清表。
            // 否则上一轮的行会残留下来，而且分辨不出哪些是过期的。
            db.prepare('DELETE FROM bus_stop_area').run()
            db.prepare('DELETE FROM bus_line_area').run()
            cleared = true
        }

        const ins = db.prepare(
            'INSERT OR REPLACE INTO bus_stop_area (stop_id, adcode, level) VALUES (?, ?, ?)'
        )
        for (const a of slice) {
            const rings = parseRings(a.polyline)
            const box = bboxOfRings(rings)
            if (!box || !rings.length) continue
            const adcode = String(a.adcode)
            for (const pt of points) {
                // 先包围盒（几次数值比较）再射线法（要遍历环的全部顶点）
                if (!bboxContains(box, pt.lng, pt.lat)) continue
                if (!pointInRings(pt.lng, pt.lat, rings)) continue
                ins.run(pt.id, adcode, a.level ?? null)
            }
        }
    })
    write()

    const stopAreas = (db.prepare('SELECT COUNT(*) AS n FROM bus_stop_area').get() as any).n
    const result: BatchResult = {
        total, offset: from, processed: slice.length, cleared,
        finished: false, stopAreas, ms: 0,
    }

    if (to >= total) {
        const derive = db.transaction(() => {
            db.prepare('DELETE FROM bus_line_area').run()
            db.prepare(DERIVE_SQL).run()
        })
        derive()

        const one = (sql: string) => (db.prepare(sql).get() as any).n
        result.lineAreas = one('SELECT COUNT(*) AS n FROM bus_line_area')
        result.linesMapped = one('SELECT COUNT(DISTINCT bus_id) AS n FROM bus_line_area')
        result.linesUnmapped = one('SELECT COUNT(*) AS n FROM bus_lines') - result.linesMapped
        result.multiAreaStops = one(
            'SELECT COUNT(*) AS n FROM (SELECT stop_id FROM bus_stop_area GROUP BY stop_id HAVING COUNT(*) > 1)'
        )
        result.finished = true
    }

    result.ms = Date.now() - started
    return result
}

// 一次跑完（脚本、测试、以及不带参数直接 POST 时用）
export function rebuildAreaMapping(): BatchResult {
    return rebuildAreaMappingBatch(0, Number.MAX_SAFE_INTEGER)
}
