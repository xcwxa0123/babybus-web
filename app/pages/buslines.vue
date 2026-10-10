<template>
	<div class="buslines">
		<!-- 页面标题（注意：不要用 <header>，全局 index.css 里 header 是吸顶栏样式） -->
		<div class="page-head">
			<div class="page-title-wrap">
				<h2 class="page-title"><span class="logo-dot" />公交线路本地库</h2>
				<span class="logo-en">Local bus line library</span>
			</div>
			<p class="page-meta">共 {{ total }} 条线路，城市 {{ city }}</p>
		</div>

		<!-- 操作区：拉取入库 / 查询 -->
		<section class="panel tools">
			<div class="tool-row">
				<div class="tool-name">拉取入库<span>按关键词获取线路并保存</span></div>
				<div class="tool-fields">
					<el-input v-model="city" class="w-sm" placeholder="citycode" />
					<el-input v-model="keyword" class="w-sm" placeholder="线路关键词" />
					<el-button type="primary" @click="fetchAndSave(keyword)">拉取并入库</el-button>
				</div>
			</div>

			<div class="tool-row">
				<div class="tool-name">查询<span>搜索线路或站点</span></div>
				<div class="tool-fields">
					<el-input v-model="searchText" class="w-lg" placeholder="搜索线路/站点" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<el-button type="primary" plain @click="onSearch">查询</el-button>
					<el-button @click="loadList">刷新列表</el-button>
				</div>
			</div>
		</section>

		<!-- 循环拉取：重操作，独立次级面板（会持续消耗接口配额，可随时停止） -->
		<section class="panel loop-panel" :class="{ running: loopRunning }">
			<div class="loop-head">
				<div class="loop-title">循环拉取脚本任务</div>
				<div class="loop-sub">按 keyword 区间依次拉取并入库，会持续消耗接口配额，可随时停止</div>
			</div>
			<div class="loop-body">
				<el-input v-model="loopStart" class="w-xs" placeholder="起始keyword" />
				<span class="range-sep">~</span>
				<el-input v-model="loopEnd" class="w-xs" placeholder="截止keyword" />
				<el-button type="warning" :disabled="loopRunning" @click="startLoopTask">开始拉取</el-button>
				<el-button v-if="loopRunning" type="danger" plain
					@click="() => { stopLoopTask(); stopClick = true }">停止</el-button>
			</div>
		</section>

		<!-- 循环拉取脚本任务进度 -->
		<section v-if="loopRunning || loopStats.total > 0" class="panel run">
			<div class="run-head">
				<div>
					<div class="run-title">循环拉取进度</div>
					<div class="run-sub">city={{ city }}，keyword {{ loopStart }}~{{ loopEnd }}</div>
				</div>
				<el-tag :type="loopRunning ? 'warning' : 'success'" effect="light" round>
					{{ loopRunning ? `执行中 keyword=${loopCurrent}` : '已结束' }}
				</el-tag>
			</div>

			<el-progress :percentage="loopPercent" :stroke-width="8" :status="loopRunning ? '' : 'success'" />

			<div class="stats">
				<div class="stat"><b>{{ loopStats.total }}</b><span>总请求</span></div>
				<div class="stat ok"><b>{{ loopStats.inserted }}</b><span>已入库</span></div>
				<div class="stat warn"><b>{{ loopStats.skipped }}</b><span>跳过已有</span></div>
				<div class="stat bad"><b>{{ loopStats.failed }}</b><span>失败</span></div>
			</div>

			<div class="log">
				<el-scrollbar max-height="220px">
					<div v-for="(line, i) in loopLog" :key="i" class="log-line">{{ line }}</div>
				</el-scrollbar>
			</div>
		</section>

		<!-- 线路列表 -->
		<section class="panel table-panel">
			<el-table v-loading="loading" :data="list" :row-class-name="rowClass" @row-click="onRowClick">
				<template #empty>
					<div class="empty">
						<div class="empty-icon"></div>
						<div class="empty-title">没有找到线路</div>
						<div class="empty-sub">填写关键词后点击「拉取并入库」，或调整查询条件试试</div>
					</div>
				</template>

				<!-- 展开行：低频 / 长文本字段收在这里，主表只留高频列 -->
				<el-table-column type="expand" width="44" class-name="col-center" label-class-name="col-center">
					<template #default="{ row }">
						<div class="row-info">
							<div class="ri-item"><span class="ri-k">线路ID</span><span class="ri-v">{{ row.id || '-' }}</span></div>
							<div class="ri-item"><span class="ri-k">城市code</span><span class="ri-v">{{ row.citycode || '-' }}</span></div>
							<div class="ri-item"><span class="ri-k">环线</span><span class="ri-v">{{ row.loop === 1 ? '是' : '否' }}</span></div>
							<div class="ri-item"><span class="ri-k">公司</span><span class="ri-v">{{ row.company || '-' }}</span></div>
							<div class="ri-item"><span class="ri-k">全程价</span><span class="ri-v">{{ row.total_price ?? '-' }}</span></div>
							<div class="ri-item"><span class="ri-k">里程</span><span class="ri-v">{{ row.distance ?? '-' }} km</span></div>
							<div class="ri-item"><span class="ri-k">UI色</span><span class="ri-v"><span v-if="row.uicolor" class="swatch" :style="{ background: colorOf(row.uicolor) }" />{{ row.uicolor || '-' }}</span></div>
							<div class="ri-item"><span class="ri-k">创建时间</span><span class="ri-v">{{ row.created_at || '-' }}</span></div>
							<div class="ri-item ri-wide"><span class="ri-k">详细时间</span><span class="ri-v pre">{{ formatTimeDesc(row.timedesc) }}</span></div>
							<div class="ri-item ri-wide"><span class="ri-k">反向ID</span><span class="ri-v">{{ row.direc || '-' }}</span></div>
							<div class="ri-item ri-wide"><span class="ri-k">矩形区域</span><span class="ri-v">{{ row.bounds || '-' }}</span></div>
							<div class="ri-item ri-wide"><span class="ri-k">坐标串</span><span class="ri-v">{{ row.polyline || '-' }}</span></div>
						</div>
					</template>
				</el-table-column>

				<el-table-column prop="name" label="线路名" min-width="160" show-overflow-tooltip>
					<template #default="{ row }">
						<span class="line-name">{{ row.name }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="type" label="类型" width="90" class-name="col-center"
					label-class-name="col-center" />
				<el-table-column prop="start_stop" label="首发站" min-width="130" show-overflow-tooltip />
				<el-table-column prop="end_stop" label="末站" min-width="130" show-overflow-tooltip />
				<el-table-column prop="start_time" label="首班" width="90" class-name="col-center"
					label-class-name="col-center" />
				<el-table-column prop="end_time" label="末班" width="90" class-name="col-center"
					label-class-name="col-center" />
				<el-table-column prop="basic_price" label="起步价" width="90" class-name="col-num"
					label-class-name="col-num" />
				<el-table-column label="状态" width="90" class-name="col-center" label-class-name="col-center">
					<template #default="{ row }">
						<span class="status" :class="`status-${row.status}`">{{ statusText(row.status) }}</span>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="150" class-name="col-center" label-class-name="col-center">
					<template #default="{ row }">
						<el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
						<el-button size="small" type="danger" @click.stop="removeLine(row)">删除</el-button>
					</template>
				</el-table-column>
			</el-table>
		</section>

		<!-- 分页懒加载 -->
		<div class="pager">
			<ClientOnly>
				<el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total"
					:page-size="pageSize" :current-page="page" :page-sizes="[10, 20, 50, 100]"
					@size-change="(s: number) => { pageSize = s; page = 1; loadList() }"
					@current-change="onPageChange" />
			</ClientOnly>
		</div>

		<!-- 线路详情（站点列表） -->
		<section v-if="detail" ref="detailRef" class="panel detail">
			<div class="detail-head">
				<div>
					<h3 class="detail-title">{{ detail.name }}</h3>
					<div class="detail-id">{{ detail.id }}，共 {{ detail.busstops?.length ?? 0 }} 站</div>
				</div>
				<el-button text @click="detail = null">收起</el-button>
			</div>
			<ol class="stops">
				<li v-for="(s, i) in detail.busstops" :key="i">
					<span class="stop-no" :style="{ background: colorOf(detail.uicolor) }">{{ Number(i) + 1 }}</span>
					<div>
						<div class="stop-name">{{ s.name }}</div>
						<div class="stop-loc">{{ s.location }}</div>
					</div>
				</li>
			</ol>
		</section>

		<!-- 编辑弹窗 -->
		<el-dialog v-model="editDialog" class="app-dialog" title="编辑线路" width="600px">
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
<script setup lang="ts">
const list = ref<any[]>([])
const detail = ref<any>(null)
const detailRef = ref<HTMLElement | null>(null)
const city = ref('0631')
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
		const res = await request('/api/buslines', {
			query: {
				keyword: searchText.value,
				citycode: city.value,
				page: page.value,
				pageSize: pageSize.value
			}
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

async function fetchAndSave(keywords: string, page: number = 1) {
	const res: any = await request('/api/mapApi/getBusmapList', {
		method: 'POST',
		body: { city: city.value, keywords, page},
	})
	const lines = Array.isArray(res) ? res : res.buslines ?? []
	if (!lines.length) {
		return { count: 0, skipped: 0 }
	}
	const saveRes = await request(
		'/api/buslines/save',
		{ method: 'POST', body: lines }
	)
	const { count, skipped } = saveRes.data
	if (skipped > 0) {
		ElMessage.info(`本次返回 ${lines.length} 条，实际入库 ${count} 条，跳过已有 ${skipped} 条`)
	} else {
		ElMessage.success(`已入库 ${count} 条线路`)
	}
	// 这里增加逻辑，用count % 50 的向上取整值，看page是不是大于，如果大于就不跑了，否则跑fetchAndSave()
	if(page + 1 <= Math.ceil(res.count / 50)){
		await sleep(LOOP_INTERVAL)   // 翻页之间也要间隔，否则容易触发高德限额
		return fetchAndSave(keywords, page + 1)
	}
	loadList()
	return { count, skipped }
}

async function showDetail(data: any) {
	const res = await request(`/api/buslines/${data.id}`)
	detail.value = res.data
	await nextTick()
	detailRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 行点击：点展开箭头时只展开字段面板，不加载站点详情
function onRowClick(row: any, _column: any, event: MouseEvent) {
	if ((event?.target as HTMLElement)?.closest?.('.el-table__expand-icon')) return
	showDetail(row)
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
	await request(`/api/buslines/${id}`, {
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
		await ElMessageBox.confirm(`确定删除线路「${data.name}」吗？拉数据是要配额的真的超麻烦的捏`, '提示', {
			type: 'warning'
		})
	} catch {
		return // 取消
	}
	const res = await request(`/api/buslines/${data.id}`, { method: 'DELETE' })
	if(res && res.code == 200){
		ElMessage.success('删除成功')
	} else {
		ElMessage.error('删除失败')
	}
	if (detail.value?.id === data.id) detail.value = null
	loadList()
}

// 当前打开详情的行高亮
function rowClass({ row }: { row: any }) {
	return detail.value && row.id === detail.value.id ? 'is-active' : ''
}

// UI色：兼容 "ff0000" 和 "#ff0000"；空值返回空串（让 CSS 用默认色）
function colorOf(c: any): string {
	const s = String(c ?? '').trim()
	if (!s) return ''
	return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : s
}

function statusText(status: any): string {
	const map: Record<number, string> = { 0: '停运', 1: '正常', 2: '规划中', 3: '在建' }
	return map[Number(status)] ?? String(status ?? '-')
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
const LOOP_INTERVAL = 2000  // 每 1 秒一次
const loopStart = ref('801')  // keyword 起始
const loopEnd = ref('999')  // keyword 截止

const loopRunning = ref(false)
const loopCurrent = ref(0)      // 当前 keyword
const loopStats = ref({ total: 0, inserted: 0, skipped: 0, failed: 0, sumFailed: 0})
const loopLog = ref<string[]>([]) // 实时日志
const loopTotalRange = ref(999)   // 总范围（用于进度条百分比）
const loopBegin = ref(0)          // 本次任务起始 keyword（用于进度条百分比）
const loopPercent = computed(() => {
	if (!loopCurrent.value || loopTotalRange.value <= 0) return 0
	return Math.min(100, Math.max(0, Math.round(((loopCurrent.value - loopBegin.value + 1) / loopTotalRange.value) * 100)))
})

const stopClick = ref(false)

// 所有的停止动作入库，停止后重新查询
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
	loopStats.value = { total: 0, inserted: 0, skipped: 0, failed: 0, sumFailed: 0}
	loopLog.value = []
	loopCurrent.value = 0
	loopTotalRange.value = rangeCount
	loopBegin.value = start

	const runOne = async (k: number, page: number = 1) => {
		loopCurrent.value = k
		loopStats.value.total++
		try {
			const res: any = await request('/api/mapApi/getBusmapList', {
				method: 'POST',
				body: { city: city.value, keywords: String(k), page } // city 取输入框值
			})
			if (res.status == '0' && res.infocode != '10000') {
				pushLog(`到限额了捏，下次从${k}开始`)
				// 保存当前 k 到数据库对应的city字段，在下次循环的时候会入库
				loopStart.value = String(k)
				stopClick.value = false   // 内部停优先，别再让 for 头覆盖
				stopLoopTask()
				return
			}
			if (res.code == '500') {
				loopStats.value.sumFailed++
				if(loopStats.value.sumFailed >= 10){
					pushLog(`第${loopStats.value.sumFailed}次报错了捏${res.msg}，停止`)
					loopStart.value = String(k)
					stopClick.value = false   // 内部停优先，别再让 for 头覆盖
					stopLoopTask()
					return
				}
				pushLog(`报错了捏${res.msg}，5 秒后重试 keyword=${k}`)
				// 随时点按钮终止
				if (!loopRunning.value) return
				await sleep(5000)
				if (!loopRunning.value) return
				return runOne(k, page)
			}
			loopStats.value.sumFailed = 0
			const lines = Array.isArray(res) ? res : res.buslines ?? []
			if (!lines.length) {
				pushLog(`keyword=${k} 无数据`)
				return
			}
			const saveRes = await request(
				'/api/buslines/save',
				{ method: 'POST', body: lines }
			)
			const { count, skipped } = saveRes.data
			loopStats.value.inserted += count
			loopStats.value.skipped += skipped
			pushLog(`keyword=${k} 返回${lines.length}条，入库${count}，跳过${skipped}`)
			// 这里增加逻辑，用count % 50 的向上取整值，看page是不是大于，如果大于就不跑了，否则跑runOne()
			if(page + 1 <= Math.ceil(res.count / 50)){
				if (!loopRunning.value) return
				await sleep(LOOP_INTERVAL)   // 翻页之间也要间隔，否则容易触发高德限额
				if (!loopRunning.value) return
				return runOne(k, page + 1)
			}

		} catch (e: any) {
			loopStats.value.failed++
			loopStats.value.sumFailed = 0
			pushLog(`keyword=${k} 失败：${e?.message ?? e}`)
		}
	}

	pushLog(`循环任务开始：city=${city.value}，keyword ${start}~${end}，间隔 ${LOOP_INTERVAL / 1000}s`)
	for (let k = start; k <= end; k++) {
		if (!loopRunning.value) {
			// 最后还没跑的index赋给start，同时存库里，意味着下次从该index直接开始
			if(stopClick.value){
				loopStart.value = String(k)
				stopClick.value = false
			}
			break;
		}
		await runOne(k)
		if (k < end && loopRunning.value) {
			await sleep(LOOP_INTERVAL)
		}
	}

	if (loopRunning.value) {
		loopStart.value = String(loopEnd.value)
		pushLog('循环任务全部完成')
	} else {
		pushLog('循环任务已停止')
	}
	loopRunning.value = false
	// 保存当前 k 到数据库对应的city字段
	await request('/api/citycodes/saveDoneNum', {
		method: 'POST',
		body: { citycode: city.value, doneNum: loopStart.value, status: loopStart.value == loopEnd.value ? 2 : 1}
	})
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

async function loadNum(citycode = '') {
	const res = await request('/api/citycodes/doneStatus', {
		query: {
			citycode,
			status: 1,
			page: 1,
			pageSize: 20
		}
	})
	if(res && res.code == 200 && res.data && res.data.length){
		loopStart.value = res.data[0].doneNum
		city.value= res.data[0].citycode
	}
}

onMounted(async () => {
	await loadNum()
	await loadList()
})

// 页面卸载 / 路由离开时先终止循环轮询，避免请求还在后台继续跑
function stopLoopOnLeave() {
	if (!loopRunning.value) return
	stopClick.value = true // 交给 for 头把当前 k 记为断点
	stopLoopTask()
}

onUnmounted(stopLoopOnLeave)

onBeforeRouteLeave(() => {
	stopLoopOnLeave()
})
</script>

