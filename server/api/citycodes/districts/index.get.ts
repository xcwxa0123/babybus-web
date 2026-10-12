// 行政区列表（管理页用）—— 只返回「这一层的行」，子树交给前端懒加载逐层拉
//
//   · 无筛选参数 → 默认返回「中国」这一个根节点
//   · 有筛选参数 → 返回命中的那一层节点（平铺，不挂子树）
//
// 每行带 hasChildren，前端据此决定要不要画展开箭头；点开某行时再调
// /api/citycodes/districts/children?adcode=xxx 取它下一层。所以这里不再需要组树。
import { computeDerivedDoneStatus, districtSelectSql } from '../../../utils/district'

// 无筛选时的默认根：中国。改成别的 adcode 就能换默认落点
const DEFAULT_ROOT_ADCODE = '100000'

export default defineEventHandler((event) => {
  try {
    const db = getDb()
    const query = getQuery(event)

    const name = (query.name as string)?.trim() || ''
    const adcode = (query.adcode as string)?.trim() || ''
    const level = (query.level as string)?.trim() || ''
    const parentAdcode = (query.parentAdcode as string)?.trim() || ''
    const hasFilter = !!(name || adcode || level || parentAdcode)

    const whereParts: string[] = []
    const params: any[] = []
    if (name) {
      whereParts.push('c.name LIKE ?')
      params.push(`${name}%`)
    }
    if (adcode) {
      whereParts.push('c.adcode LIKE ?')
      params.push(`${adcode}%`)
    }
    if (level) {
      whereParts.push('c.level = ?')
      params.push(level)
    }
    if (parentAdcode) {
      whereParts.push('c.parent_adcode = ?')
      params.push(parentAdcode)
    }
    if (!hasFilter) {
      // 无筛选就落到「中国」这一个节点
      whereParts.push('c.adcode = ?')
      params.push(DEFAULT_ROOT_ADCODE)
    }

    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''
    let rows = db.prepare(districtSelectSql(where)).all(...params) as any[]

    // 兜底：库里还没有国家层节点时（全新库 / 只导了某个省），
    // 默认那条会命中 0 行，退回展示所有顶层节点，免得页面一片空白
    if (!hasFilter && !rows.length) {
      rows = db.prepare(districtSelectSql('WHERE c.parent_adcode IS NULL')).all() as any[]
    }

    const { total } = db.prepare('SELECT COUNT(*) AS total FROM city_codes').get() as any
    const { withBoundary } = db
      .prepare(`SELECT COUNT(*) AS withBoundary FROM city_codes WHERE polyline IS NOT NULL AND polyline <> ''`)
      .get() as any

    // 没有 citycode 记录的行（国家 / 省级）按下属层级汇总出一个状态，规则见 computeDerivedDoneStatus
    const derived = computeDerivedDoneStatus(db)

    const data = rows.map((r) => ({
      ...r,
      // hasChildren 统一成布尔（EP 懒加载看它的真值决定要不要画箭头）
      hasChildren: !!r.hasChildren,
      doneStatus: r.doneStatus ?? derived.get(String(r.adcode)) ?? 0
    }))

    return {
      data,
      matched: data.length,
      // 本次是不是走的「无筛选默认中国」这条路，前端据此决定要不要提示命中数
      defaulted: !hasFilter,
      total,
      withBoundary,
      code: 200,
      msg: 'ok'
    }
  } catch (error) {
    return {
      data: [],
      matched: 0,
      defaulted: false,
      total: 0,
      withBoundary: 0,
      code: 500,
      msg: String(error)
    }
  }
})
