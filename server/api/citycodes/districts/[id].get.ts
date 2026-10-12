// 单条行政区详情（含完整 polyline），编辑弹窗打开时调用
export default defineEventHandler((event) => {
  try {
    const id = Number(getRouterParam(event, 'id'))
    if (!id) return { data: null, code: 400, msg: 'id 无效' }

    const db = getDb()
    const row = db.prepare(`
      SELECT
        id,
        name,
        adcode,
        citycode,
        parent_adcode AS parentAdcode,
        level,
        polyline
      FROM city_codes WHERE id = ?
    `).get(id)

    if (!row) return { data: null, code: 404, msg: '记录不存在' }
    return { data: row, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: null, code: 500, msg: String(error) }
  }
})
