// 可更新的线路字段白名单
const EDITABLE = [
  'type', 'name', 'polyline', 'citycode', 'start_stop', 'end_stop',
  'start_time', 'end_time', 'uicolor', 'timedesc', 'distance', 'loop',
  'status', 'direc', 'company', 'basic_price', 'total_price', 'bounds'
]

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const body = await readBody(event)
    const db = getDb()

    // 判断线路是否存在
    const exist = db.prepare('SELECT id FROM bus_lines WHERE id = ?').get(id)
    if (!exist) {
      return { data: {}, code: 404, msg: '线路不存在' }
    }

    const save = db.transaction(() => {
      // 1. 更新传入的字段（动态拼接 SET，只更新白名单内且非空的值）
      const updates: string[] = []
      const params: any = { id }
      for (const key of EDITABLE) {
        if (body[key] !== undefined && body[key] !== null) {
          updates.push(`${key} = @${key}`)
          params[key] = key === 'timedesc' ? parseTimeDesc(body[key]) : bindable(body[key])
        }
      }
      if (updates.length) {
        db.prepare(`UPDATE bus_lines SET ${updates.join(', ')} WHERE id = @id`).run(params)
      }

      // 2. 若传入 busstops，则重建序列
      if (Array.isArray(body.busstops)) {
        const clearSeq = db.prepare('DELETE FROM bus_stop_sequences WHERE bus_id = ?')
        const upsertStop = db.prepare(`
          INSERT INTO bus_stops (id, name, location) VALUES (@id, @name, @location)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, location = excluded.location
        `)
        const insertSeq = db.prepare(`
          INSERT INTO bus_stop_sequences (bus_id, stop_id, seq)
          VALUES (@bus_id, @stop_id, @seq)
          ON CONFLICT(bus_id, stop_id, seq) DO NOTHING
        `)
        clearSeq.run(id)
        body.busstops.forEach((stop: any, index: number) => {
          const stopId = String(stop.id)
          upsertStop.run({ id: stopId, name: bindable(stop.name, ''), location: bindable(stop.location) })
          insertSeq.run({ bus_id: id, stop_id: stopId, seq: Number(stop.sequence ?? index + 1) })
        })
      }
    })
    save()

    return { data: { id }, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: {}, code: 500, msg: String(error) }
  }
})

function parseTimeDesc(raw: any): string {
  if (raw === null || raw === undefined) return ''
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.join(';') : String(parsed)
  } catch {
    return String(raw)
  }
}

function bindable(value: any, fallback: string | null = null): string | number | null {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'number') return value
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : fallback
  return JSON.stringify(value)
}
