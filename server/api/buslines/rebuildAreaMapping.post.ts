// 重建「站点 → 行政区」「线路 → 行政区」映射表（分批执行，前端逐批调用并显示进度）。
//
// body: { offset?: number, limit?: number }
//   · offset 从 0 开始，前端每批把 offset 往后推
//   · 不带参数 = 一次性跑完（脚本 / 手工调用）
//
// 纯本地 CPU 计算，不消耗高德配额，可随时反复重跑。
// 显式导入而不是靠 Nitro 自动导入（自动导入的类型清单有刷新延迟）
import { rebuildAreaMapping, rebuildAreaMappingBatch } from '../../utils/areaMapping'

export default defineEventHandler(async (event) => {
  try {
    let body: any = {}
    try {
      body = await readBody(event)
    } catch {
      body = {}
    }
    const hasRange = body && (body.offset !== undefined || body.limit !== undefined)
    const data = hasRange
      ? rebuildAreaMappingBatch(Number(body.offset) || 0, Number(body.limit) || 200)
      : rebuildAreaMapping()
    return { data, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: {}, code: 500, msg: String(error) }
  }
})
