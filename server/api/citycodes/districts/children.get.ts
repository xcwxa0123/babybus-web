// 某一级行政区的「直接子级」——给列表的懒加载用，点开一行才查一层
// 只返回下一层，不带孙子辈；每行带 hasChildren 告诉前端还要不要再给展开箭头
import { districtSelectSql } from '../../../utils/district'

export default defineEventHandler((event) => {
  try {
    const adcode = (getQuery(event).adcode as string)?.trim()
    if (!adcode) return { data: [], code: 400, msg: 'adcode 不能为空' }

    const db = getDb()
    const rows = db
      .prepare(districtSelectSql('WHERE c.parent_adcode = ?'))
      .all(adcode) as any[]

    // EP 的懒加载用 row.hasChildren 的「真值」决定要不要画展开箭头，统一成布尔更稳
    const data = rows.map((r) => ({ ...r, hasChildren: !!r.hasChildren }))
    return { data, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: [], code: 500, msg: String(error) }
  }
})
