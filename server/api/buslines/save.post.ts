export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const lines: any[] = Array.isArray(body) ? body : [body]
    const db = getDb()

    // 线路插入（已存在则跳过，用 DO NOTHING 保持原子性）
    const insertLine = db.prepare(`
      INSERT INTO bus_lines (
        id, type, name, polyline, citycode, start_stop, end_stop,
        start_time, end_time, uicolor, timedesc, distance, loop, status,
        direc, company, basic_price, total_price, bounds
      ) VALUES (
        @id, @type, @name, @polyline, @citycode, @start_stop, @end_stop,
        @start_time, @end_time, @uicolor, @timedesc, @distance, @loop, @status,
        @direc, @company, @basic_price, @total_price, @bounds
      )
      ON CONFLICT(id) DO NOTHING
    `)

    // 判断线路是否已存在
    const findLine = db.prepare('SELECT id FROM bus_lines WHERE id = ?')

    // 站点 upsert（去重）
    const upsertStop = db.prepare(`
      INSERT INTO bus_stops (id, name, location) VALUES (@id, @name, @location)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, location = excluded.location
    `)

    // 序列插入（一行一站）
    const insertSeq = db.prepare(`
      INSERT INTO bus_stop_sequences (bus_id, stop_id, seq)
      VALUES (@bus_id, @stop_id, @seq)
      ON CONFLICT(bus_id, stop_id, seq) DO NOTHING
    `)

    const saveOne = (line: any): boolean => {
      const lineId = String(line.id ?? line.busid)

      // 已存在则跳过，不重复入库（也不插站点）
      if (findLine.get(lineId)) return false

      // 1. 插线路（返回 changes 判断是否真正插入）
      const result = insertLine.run({
        id: lineId,
        type: bindable(line.type),
        name: bindable(line.name, ''),
        polyline: bindable(line.polyline),
        citycode: bindable(line.citycode),
        start_stop: bindable(line.start_stop),
        end_stop: bindable(line.end_stop),
        start_time: bindable(line.start_time),
        end_time: bindable(line.end_time),
        uicolor: bindable(line.uicolor),
        timedesc: parseTimeDesc(line.timedesc),
        distance: bindable(line.distance),
        loop: bindable(line.loop),
        status: bindable(line.status),
        direc: bindable(line.direc),
        company: bindable(line.company),
        basic_price: bindable(line.basic_price),
        total_price: bindable(line.total_price),
        bounds: bindable(line.bounds),
      })
      if (result.changes === 0) return false // 冲突被跳过

      // 2. 存站点 + 序列（仅新插入的线路才存）
      const busstops: any[] = line.busstops ?? []
      busstops.forEach((stop, index) => {
        upsertStop.run({
          id: String(stop.id),
          name: bindable(stop.name, ''),
          location: bindable(stop.location),
        })
        insertSeq.run({
          bus_id: lineId,
          stop_id: String(stop.id),
          seq: Number(stop.sequence ?? index + 1),
        })
      })
      return true
    }

    const saveAll = db.transaction((list: any[]): number => {
      let inserted = 0
      for (const line of list) {
        if (saveOne(line)) inserted++
      }
      return inserted
    })
    const inserted = saveAll(lines)

    return {
      data: { count: inserted, skipped: lines.length - inserted },
      code: 200,
      msg: 'ok'
    }
  } catch (error) {
    return { data: {}, code: 500, msg: String(error) }
  }
})

// timedesc 是 JSON 串，需要解码解析（如 '["06:00-21:30"]' 或 '06:00-21:30'）
function parseTimeDesc(raw: any): string {
  if (raw === null || raw === undefined) return ''
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.join(';') : String(parsed)
  } catch {
    return String(raw)
  }
}

// better-sqlite3 只能绑定 number/string/bigint/buffer/null。
// 高德返回的空数组/对象/boolean 需统一转成可绑定值，防止报错。
function bindable(value: any, fallback: string | null = null): string | number | null {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'number') return value
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : fallback
  // 其它（对象、bigint 等）统一 JSON 序列化
  return JSON.stringify(value)
}
