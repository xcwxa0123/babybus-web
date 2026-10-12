// 批量导入行政区（前端已把高德返回的 JSON 拍平成 items，这里只做清洗 + upsert）
// items: [{ adcode, name, level, citycode, parentAdcode, polyline }]
// 显式导入而不是靠 Nitro 自动导入：自动导入的类型由 nuxt prepare 生成，
// 新加的函数在类型清单刷新前 IDE 会报「找不到名称」
import { normalizeAdcode, normalizeCitycode, normalizePolyline } from '../../../utils/district'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const items: any[] = Array.isArray(body?.items) ? body.items : []
    if (!items.length) {
      return { data: { inserted: 0, updated: 0, skipped: 0 }, code: 400, msg: '没有可导入的数据' }
    }

    const db = getDb()

    // adcode 不唯一，取第一条命中的作为更新目标
    const findByAdcode = db.prepare('SELECT id FROM city_codes WHERE adcode = ? LIMIT 1')
    const insertRow = db.prepare(`
      INSERT INTO city_codes (name, adcode, citycode, parent_adcode, level, polyline)
      VALUES (@name, @adcode, @citycode, @parentAdcode, @level, @polyline)
    `)
    // 没带边界时保留库里已有的边界（COALESCE 兜底），避免「导入层级」把边界冲掉
    const updateRow = db.prepare(`
      UPDATE city_codes
      SET name = @name,
          citycode = @citycode,
          parent_adcode = @parentAdcode,
          level = @level,
          polyline = COALESCE(@polyline, polyline)
      WHERE id = @id
    `)

    let inserted = 0
    let updated = 0
    let skipped = 0

    const runAll = db.transaction((list: any[]) => {
      for (const raw of list) {
        const adcode = normalizeAdcode(raw?.adcode)
        const name = String(raw?.name ?? '').trim()
        // adcode 与名称是必需品，缺一个就跳过（高德返回里偶尔有空的占位节点）
        if (!adcode || !name) {
          skipped++
          continue
        }

        const payload = {
          name,
          adcode,
          citycode: normalizeCitycode(raw?.citycode),
          parentAdcode: normalizeAdcode(raw?.parentAdcode),
          level: raw?.level ? String(raw.level).trim().toLowerCase() || null : null,
          polyline: normalizePolyline(raw?.polyline),
        }

        const hit = findByAdcode.get(adcode) as any
        if (hit) {
          updateRow.run({ ...payload, id: hit.id })
          updated++
        } else {
          insertRow.run(payload)
          inserted++
        }
      }
    })
    runAll(items)

    return { data: { inserted, updated, skipped }, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: { inserted: 0, updated: 0, skipped: 0 }, code: 500, msg: String(error) }
  }
})
