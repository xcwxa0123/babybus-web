// 重建「站点 → 行政区」「线路 → 行政区」映射表。
// 纯本地 CPU 计算，不消耗高德配额，可随时反复重跑（整体替换，不会留下过期行）。
// 显式导入而不是靠 Nitro 自动导入（自动导入的类型清单有刷新延迟）
import { rebuildAreaMapping } from '../../utils/areaMapping'

export default defineEventHandler(() => {
  try {
    return { data: rebuildAreaMapping(), code: 200, msg: 'ok' }
  } catch (error) {
    return { data: {}, code: 500, msg: String(error) }
  }
})
