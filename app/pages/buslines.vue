<script setup lang="ts">
const list = ref<any[]>([])
const detail = ref<any>(null)
const city = ref('370681')
const keyword = ref('1')
const searchText = ref('')

// ---- 分页状态 ----
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const loading = ref(false)

// ---- 编辑弹窗 ----
const editDialog = ref(false)
const editForm = ref<any>({})

async function loadList() {
  loading.value = true
  try {
    const res = await $fetch<{ data: any; total: number }>('/api/buslines', {
      query: { keyword: searchText.value, page: page.value, pageSize: pageSize.value }
    })
    list.value = res.data ?? []
    total.value = res.total ?? 0
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  loadList()
}

async function fetchAndSave(keywords: string) {
  const res: any = await $fetch('/api/mapApi/getBusmapList', {
    method: 'POST',
    body: { city: city.value, keywords }
  })
  const lines = Array.isArray(res) ? res : res.buslines ?? []
  if (!lines.length) {
    return { count: 0, skipped: 0 }
  }
  const saveRes = await $fetch<{ data: { count: number; skipped: number } }>(
    '/api/buslines/save',
    { method: 'POST', body: lines }
  )
  const { count, skipped } = saveRes.data
  if (skipped > 0) {
    ElMessage.info(`本次返回 ${lines.length} 条，实际入库 ${count} 条，跳过已有 ${skipped} 条`)
  } else {
    ElMessage.success(`已入库 ${count} 条线路`)
  }
  loadList()
  return { count, skipped }
}

async function showDetail(data: any) {
  const res = await $fetch<{ data: any; code: number }>(`/api/buslines/${data.id}`)
  detail.value = res.data
}

function onSearch() {
  page.value = 1 // 搜索时回到第一页
  loadList()
}

// ---- 编辑 ----
function openEdit(data: any) {
  editForm.value = { ...data }
  editDialog.value = true
}

async function submitEdit() {
  const { id, ...rest } = editForm.value
  await $fetch(`/api/buslines/${id}`, {
    method: 'PUT',
    body: rest
  })
  editDialog.value = false
  ElMessage.success('修改成功')
  loadList()
}

// ---- 删除 ----
async function removeLine(data: any) {
  try {
    await ElMessageBox.confirm(`确定删除线路「${data.name}」吗？`, '提示', {
      type: 'warning'
    })
  } catch {
    return // 取消
  }
  await $fetch(`/api/buslines/${data.id}`, { method: 'DELETE' })
  ElMessage.success('删除成功')
  if (detail.value?.id === data.id) detail.value = null
  loadList()
}

function statusText(status: any): string {
  const map: Record<number, string> = { 0: '停运', 1: '正常', 2: '规划中', 3: '在建' }
  return map[Number(status)] ?? String(status ?? '-')
}

// 列表预览：只取详细时间的第一行
function timeDescPreview(raw: any): string {
  const full = formatTimeDesc(raw)
  const lines = String(full).split('\n').filter(Boolean)
  return lines[0] ?? ''
}

// 详细时间字段是「URL 编码的 JSON 串」，拆成可读的排班描述
function formatTimeDesc(raw: any): string {
  if (!raw) return '-'
  // 1. 先尝试 URL 解码 + JSON 解析
  try {
    const decoded = decodeURIComponent(String(raw))
    const parsed = JSON.parse(decoded)
    // 优先用 allRemark（已是组装好的可读文本）
    if (parsed.allRemark) return parsed.allRemark
    // 否则遍历 rule_group 拼装
    if (Array.isArray(parsed.rule_group) && parsed.rule_group.length) {
      return parsed.rule_group
        .map((g: any) => {
          const month = g?.date?.month_range || ''
          const time = g?.time_group?.map((t: any) => {
            const st = t?.start_time?.slice(0, 5) ?? ''
            const et = t?.end_time?.slice(0, 5) ?? ''
            return st && et ? `${st}-${et}` : ''
          }).filter(Boolean).join(', ')
          const interval = g?.time_group?.[0]?.interval_time
            ? ` ${formatInterval(g.time_group[0].interval_time)}/趟` : ''
          return [month, time, interval].filter(Boolean).join(' ') || ''
        })
        .filter(Boolean)
        .join('\n')
    }
    return decoded
  } catch {
    // 解析失败则原样返回
    return String(raw)
  }
}

// 时间间隔格式化为可读（如 00:30:00 -> 30分钟）
function formatInterval(t: string): string {
  const m = String(t).split(':')
  const hours = Number(m[0]) || 0
  const mins = Number(m[1]) || 0
  if (hours && mins) return `${hours}小时${mins}分钟`
  if (hours) return `${hours}小时`
  return `${mins}分钟`
}

// ---- 循环拉取脚本任务 ----
const LOOP_INTERVAL = 1000  // 每 1 秒一次
const loopStart = ref('631')  // keyword 起始
const loopEnd = ref('999')  // keyword 截止

const loopRunning = ref(false)
const loopCurrent = ref(0)      // 当前 keyword
const loopStats = ref({ total: 0, inserted: 0, skipped: 0, failed: 0 })
const loopLog = ref<string[]>([]) // 实时日志
const loopTotalRange = ref(999)   // 总范围（用于进度条百分比）

let loopTimer: ReturnType<typeof setInterval> | null = null

async function startLoopTask() {
  if (loopRunning.value) return

  const start = Number(loopStart.value) || 1
  const end = Number(loopEnd.value) || 999
  const rangeCount = Math.max(0, end - start + 1)
  if (rangeCount <= 0) {
    ElMessage.warning('起始 keyword 不能大于截止 keyword')
    return
  }

  loopRunning.value = true
  loopStats.value = { total: 0, inserted: 0, skipped: 0, failed: 0 }
  loopLog.value = []
  loopCurrent.value = 0
  loopTotalRange.value = rangeCount

  const runOne = async (k: number) => {
    loopCurrent.value = k
    loopStats.value.total++
    try {
      const res: any = await $fetch('/api/mapApi/getBusmapList', {
        method: 'POST',
        body: { city: city.value, keywords: String(k) } // city 取输入框值
      })
      const lines = Array.isArray(res) ? res : res.buslines ?? []
      if (!lines.length) {
        pushLog(`keyword=${k} 无数据`)
        return
      }
      const saveRes = await $fetch<{ data: { count: number; skipped: number } }>(
        '/api/buslines/save',
        { method: 'POST', body: lines }
      )
      const { count, skipped } = saveRes.data
      loopStats.value.inserted += count
      loopStats.value.skipped += skipped
      pushLog(`keyword=${k} 返回${lines.length}条，入库${count}，跳过${skipped}`)
    } catch (e: any) {
      loopStats.value.failed++
      pushLog(`keyword=${k} 失败：${e?.message ?? e}`)
    }
  }

  pushLog(`循环任务开始：city=${city.value}，keyword ${start}~${end}，间隔 ${LOOP_INTERVAL / 1000}s`)
  for (let k = start; k <= end; k++) {
    if (!loopRunning.value) break // 停止
    await runOne(k)
    if (k < end && loopRunning.value) {
      await sleep(LOOP_INTERVAL)
    }
  }

  if (loopRunning.value) {
    pushLog('循环任务全部完成')
  } else {
    pushLog('循环任务已停止')
  }
  loopRunning.value = false
  loadList()
}

function stopLoopTask() {
  loopRunning.value = false
}

function pushLog(msg: string) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  loopLog.value.push(`[${time}] ${msg}`)
  if (loopLog.value.length > 200) loopLog.value.shift()
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

onMounted(loadList)
</script>

<template>
  <div style="padding: 20px">
    <h2>公交线路本地库</h2>

    <!-- 拉取入库 + 搜索 -->
    <div style="margin-bottom: 12px">
      <el-input v-model="city" style="width: 130px; margin-right: 8px" placeholder="citycode" />
      <el-input v-model="keyword" style="width: 130px; margin-right: 8px" placeholder="线路关键词" />
      <el-button type="primary" @click="fetchAndSave(keyword)">拉取并入库</el-button>
      <el-input
        v-model="searchText"
        style="width: 180px; margin: 0 8px"
        placeholder="搜索线路/站点"
        clearable
        @keyup.enter="onSearch"
        @clear="onSearch"
      />
      <el-button type="success" @click="onSearch">查询</el-button>
      <el-button @click="loadList">刷新列表</el-button>
      <br style="clear: both" />
      <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px">
        <span style="font-size: 13px">循环任务:</span>
        <el-input v-model="loopStart" style="width: 100px" placeholder="起始keyword" />
        <span>~</span>
        <el-input v-model="loopEnd" style="width: 100px" placeholder="截止keyword" />
        <el-button type="warning" :disabled="loopRunning" @click="startLoopTask">
          循环拉取脚本任务
        </el-button>
        <el-button v-if="loopRunning" type="danger" @click="stopLoopTask">停止</el-button>
      </div>
    </div>

    <!-- 循环拉取脚本任务进度 -->
    <el-card v-if="loopRunning || loopStats.total > 0" style="margin-top: 16px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <b>循环拉取脚本任务（city={{ city }}，keyword {{ loopStart }}~{{ loopEnd }}）</b>
          <el-tag :type="loopRunning ? 'warning' : 'success'">
            {{ loopRunning ? `执行中 keyword=${loopCurrent}` : '已结束' }}
          </el-tag>
        </div>
      </template>

      <el-progress
        :percentage="Math.min(100, Math.round((loopCurrent / loopTotalRange) * 100))"
        :status="loopRunning ? '' : 'success'"
        style="margin-bottom: 8px"
      />
      <div style="margin-bottom: 8px">
        <el-tag>总请求 {{ loopStats.total }}</el-tag>
        <el-tag type="success" style="margin-left: 6px">已入库 {{ loopStats.inserted }}</el-tag>
        <el-tag type="warning" style="margin-left: 6px">跳过已有 {{ loopStats.skipped }}</el-tag>
        <el-tag type="danger" style="margin-left: 6px">失败 {{ loopStats.failed }}</el-tag>
      </div>

      <el-scrollbar max-height="220px">
        <div v-for="(line, i) in loopLog" :key="i" style="font-size: 12px; line-height: 1.8">
          {{ line }}
        </div>
      </el-scrollbar>
    </el-card>

    <!-- 线路列表 -->
    <el-table v-loading="loading" :data="list" style="margin-top: 16px" @row-click="showDetail">
      <el-table-column prop="id" label="线路ID" min-width="200" show-overflow-tooltip />
      <el-table-column prop="name" label="线路名" min-width="160" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" min-width="80" />
      <el-table-column prop="citycode" label="城市code" width="80" />
      <el-table-column prop="start_stop" label="首发站" min-width="110" show-overflow-tooltip />
      <el-table-column prop="end_stop" label="末站" min-width="110" show-overflow-tooltip />
      <el-table-column prop="start_time" label="首班" width="90" />
      <el-table-column prop="end_time" label="末班" width="90" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          {{ statusText(row.status) }}
        </template>
      </el-table-column>
      <el-table-column label="环线" width="70">
        <template #default="{ row }">
          {{ row.loop === 1 ? '是' : '否' }}
        </template>
      </el-table-column>
      <el-table-column prop="company" label="公司" min-width="120" show-overflow-tooltip />
      <el-table-column prop="basic_price" label="起步价" width="80" />
      <el-table-column prop="total_price" label="全程价" width="80" />
      <el-table-column prop="distance" label="里程(km)" width="90" />
      <el-table-column prop="uicolor" label="UI色" width="80" />
      <el-table-column label="详细时间" min-width="180">
        <template #default="{ row }">
          <el-tooltip placement="top" :show-after="300">
            <template #content>
              <div style="white-space: pre-line; max-width: 420px">{{ formatTimeDesc(row.timedesc) }}</div>
            </template>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
              {{ timeDescPreview(row.timedesc) }}
            </div>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="direc" label="反向ID" min-width="180" show-overflow-tooltip />
      <el-table-column prop="bounds" label="矩形区域" min-width="180" show-overflow-tooltip />
      <el-table-column prop="polyline" label="坐标串" min-width="180" show-overflow-tooltip />
      <el-table-column prop="created_at" label="创建时间" width="170" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click.stop="removeLine(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页懒加载 -->
    <div style="display: flex; justify-content: flex-end; margin-top: 12px">
      <ClientOnly>
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="(s: number) => { pageSize = s; page = 1; loadList() }"
          @current-change="onPageChange"
        />
      </ClientOnly>
    </div>

    <!-- 线路详情（站点列表） -->
    <div v-if="detail" style="margin-top: 16px">
      <h3>{{ detail.name }}（{{ detail.id }}）- 共 {{ detail.busstops?.length ?? 0 }} 站</h3>
      <el-table :data="detail.busstops" style="margin-top: 8px">
        <el-table-column type="index" label="序号" width="70" />
        <el-table-column prop="name" label="站名" min-width="160" />
        <el-table-column prop="location" label="经纬度" min-width="180" />
      </el-table>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editDialog" title="编辑线路" width="600px">
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="线路名"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="类型"><el-input v-model="editForm.type" /></el-form-item>
        <el-form-item label="首发站"><el-input v-model="editForm.start_stop" /></el-form-item>
        <el-form-item label="末站"><el-input v-model="editForm.end_stop" /></el-form-item>
        <el-form-item label="首班"><el-input v-model="editForm.start_time" /></el-form-item>
        <el-form-item label="末班"><el-input v-model="editForm.end_time" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" placeholder="线路状态">
            <el-option :value="0" label="停运" />
            <el-option :value="1" label="正常" />
            <el-option :value="2" label="规划中" />
            <el-option :value="3" label="在建" />
          </el-select>
        </el-form-item>
        <el-form-item label="公司"><el-input v-model="editForm.company" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
