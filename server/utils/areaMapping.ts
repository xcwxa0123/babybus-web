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
// 整体替换而不是增量：几何判断只对「去重后的站点」（约 2.4 万个）做一次，
// 边界全爬完也只是一两秒的事，比维护增量状态可靠得多。
import { bboxContains, bboxOfRings, parseLngLat, parseRings, pointInRings } from './geo'

export type RebuildResult = {
    areasUsed: number          // 参与判断的区县数（有边界的）
    stopsScanned: number       // 参与判断的站点数
    stopAreas: number          // 落进 bus_stop_area 的行数
    lineAreas: number          // 落进 bus_line_area 的行数
    linesMapped: number        // 至少落进一个区县的线路数
    linesUnmapped: number      // 一个区县都没落进去的线路数（所属区域边界还没爬）
    multiAreaStops: number     // 同时落在多个区县的站点数 —— 正常应为 0，非 0 是边界数据重叠的信号
    ms: number
}

export function rebuildAreaMapping(): RebuildResult {
    const started = Date.now()
    const db = getDb()

    // 1. 把所有有边界的区县读进内存。只取 district 一层，
    //    所以候选集是几千个而不是上万个 —— 省 / 市 / 国不需要判断。
    const areas = (
        db
            .prepare(
                `SELECT adcode, level, polyline FROM city_codes
                 WHERE level = 'district' AND polyline IS NOT NULL AND polyline <> ''`
            )
            .all() as any[]
    )
        .map((a) => {
            const rings = parseRings(a.polyline)
            return { adcode: String(a.adcode), level: a.level as string | null, rings, box: bboxOfRings(rings) }
        })
        .filter((a) => a.box && a.rings.length)

    if (!areas.length) {
        return {
            areasUsed: 0, stopsScanned: 0, stopAreas: 0, lineAreas: 0,
            linesMapped: 0, linesUnmapped: 0, multiAreaStops: 0, ms: Date.now() - started,
        }
    }

    // 2. 逐个站点定归属。
    //    顺序很重要：先包围盒（几次数值比较）再射线法（要遍历环的所有顶点），
    //    绝大多数「站点 × 区县」组合在第一步就被排掉了。
    const stops = db
        .prepare("SELECT id, location FROM bus_stops WHERE location IS NOT NULL AND location <> ''")
        .all() as any[]

    const stopAreaRows: { stop_id: string; adcode: string; level: string | null }[] = []
    let multiAreaStops = 0
    for (const s of stops) {
        const point = parseLngLat(s.location)
        if (!point) continue
        let hits = 0
        for (const a of areas) {
            const box = a.box as NonNullable<typeof a.box>
            if (!bboxContains(box, point[0], point[1])) continue
            if (!pointInRings(point[0], point[1], a.rings)) continue
            stopAreaRows.push({ stop_id: String(s.id), adcode: a.adcode, level: a.level })
            hits++
        }
        if (hits > 1) multiAreaStops++
    }

    // 3. 一个事务里整体替换，中途失败也不会留下半张表
    const replaceAll = db.transaction(() => {
        db.prepare('DELETE FROM bus_stop_area').run()
        db.prepare('DELETE FROM bus_line_area').run()

        const insStopArea = db.prepare(
            'INSERT OR REPLACE INTO bus_stop_area (stop_id, adcode, level) VALUES (?, ?, ?)'
        )
        for (const r of stopAreaRows) insStopArea.run(r.stop_id, r.adcode, r.level)

        // 4. 线路表纯 SQL 派生，不再做任何几何判断：
        //    线路经过的区县 = 它的站点所属区县的并集。
        //    is_start / is_end 用「组内是否存在 seq 等于全表首 / 末 seq 的行」判断，
        //    环线的首末站落在同一个区时两列都会是 1 —— 这正是要的（它既是始发也是终到，不是途经）。
        db.prepare(`
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
        `).run()
    })
    replaceAll()

    const lineAreas = (db.prepare('SELECT COUNT(*) AS n FROM bus_line_area').get() as any).n
    const linesMapped = (db.prepare('SELECT COUNT(DISTINCT bus_id) AS n FROM bus_line_area').get() as any).n
    const linesTotal = (db.prepare('SELECT COUNT(*) AS n FROM bus_lines').get() as any).n

    return {
        areasUsed: areas.length,
        stopsScanned: stops.length,
        stopAreas: stopAreaRows.length,
        lineAreas,
        linesMapped,
        linesUnmapped: linesTotal - linesMapped,
        multiAreaStops,
        ms: Date.now() - started,
    }
}
