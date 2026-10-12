// 补一条行政区的边界（前端循环任务逐条调用，节流放在前端）
// 显式导入而不是靠 Nitro 自动导入（自动导入的类型清单有刷新延迟）
import { fetchAndSaveDistrictPolyline } from '../../../utils/districtPolyline'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { code, msg, ...data } = await fetchAndSaveDistrictPolyline(body?.adcode)
    return { data, code, msg }
  } catch (error) {
    return { data: {}, code: 500, msg: String(error) }
  }
})
