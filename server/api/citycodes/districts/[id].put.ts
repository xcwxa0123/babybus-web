// 更新单条行政区的层级归属与边界
// 按 id（主键）而不是 adcode 定位：adcode 在表里不唯一，用它更新可能命中多行
// 显式导入而不是靠 Nitro 自动导入（自动导入的类型清单有刷新延迟）
import { normalizeAdcode, normalizePolyline } from '../../../utils/district'

export default defineEventHandler(async (event) => {
  try {
    const id = Number(getRouterParam(event, 'id'))
    if (!id) return { data: {}, code: 400, msg: 'id 无效' }

    const body = await readBody(event)
    const db = getDb()

    const exists = db.prepare('SELECT id FROM city_codes WHERE id = ?').get(id)
    if (!exists) return { data: {}, code: 404, msg: '记录不存在' }

    // 三个字段都允许显式清空：空字符串 / null 统一写成 NULL
    const parentAdcode = normalizeAdcode(body?.parentAdcode)
    const level = body?.level ? String(body.level).trim().toLowerCase() || null : null
    const polyline = normalizePolyline(body?.polyline)

    db.prepare(`
      UPDATE city_codes
      SET parent_adcode = ?, level = ?, polyline = ?
      WHERE id = ?
    `).run(parentAdcode, level, polyline, id)

    return { data: { id }, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: {}, code: 500, msg: String(error) }
  }
})
