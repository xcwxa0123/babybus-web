// 更新某个 citycode 的爬取进度
// 接收：citycode / doneNum / status
// 仅在 done_num 或 status 的值发生变化时才执行更新（SQL 层面用 IS NOT 做 NULL 安全比较）
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const citycode = String(body.citycode ?? '').trim()
    const doneNum = Number(body.doneNum ?? 0)
    const status = Number(body.status ?? 0)

    if (!citycode) {
      return { data: {}, code: 400, msg: 'citycode 不能为空' }
    }

    const db = getDb()

    // 仅当 done_num 或 status 发生变化时才更新
    const info = db.prepare(`
      UPDATE done_num_citycode
      SET done_num = ?,
          status = ?,
          updated_at = datetime('now', 'localtime')
      WHERE citycode = ?
        AND (done_num IS NOT ? OR status IS NOT ?)
    `).run(doneNum, status, citycode, doneNum, status)

    // changes 为 0 有两种情况：值没变 / 记录不存在
    if (info.changes === 0) {
      const exists = db
        .prepare('SELECT 1 AS ok FROM done_num_citycode WHERE citycode = ?')
        .get(citycode)

      if (!exists) {
        // 记录不存在则创建（total_num 与 updated_at 走表默认值）
        db.prepare(`
          INSERT INTO done_num_citycode (citycode, done_num, status)
          VALUES (?, ?, ?)
        `).run(citycode, doneNum, status)
        return { data: { citycode, action: 'inserted' }, code: 200, msg: 'ok' }
      }
      return { data: { citycode, action: 'unchanged' }, code: 200, msg: 'ok' }
    }

    return { data: { citycode, action: 'updated' }, code: 200, msg: 'ok' }
  } catch (error) {
    return { data: {}, code: 500, msg: String(error) }
  }
})
