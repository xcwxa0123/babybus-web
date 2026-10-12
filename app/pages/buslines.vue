<template>
	<div class="buslines">
		<!-- 页面标题（注意：不要用 <header>，全局 index.css 里 header 是吸顶栏样式） -->
		<div class="page-head">
			<div class="page-title-wrap">
				<h2 class="page-title"><span class="logo-dot" />公交线路本地库</h2>
				<span class="logo-en">Local bus line library</span>
			</div>
			<p class="page-meta">
				<template v-if="selectedArea">{{ selectedArea.name }}：共 {{ total }} 条线路</template>
				<template v-else>共 {{ total }} 条线路，城市 {{ city }}</template>
			</p>
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

			<!-- <div class="tool-row">
				<div class="tool-name">查询<span>搜索线路或站点</span></div>
				<div class="tool-fields">
					<el-input v-model="searchText" class="w-lg" placeholder="搜索线路/站点" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<el-button type="primary" plain @click="onSearch">查询</el-button>
					<el-button @click="loadList">刷新列表</el-button>
				</div>
			</div> -->
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

		<!-- 重建映射：纯本地计算，不消耗配额，每天爬完新线路点一次 -->
		<section class="panel map-panel" :class="{ running: mapRunning }">
			<div class="map-head">
				<div class="map-title">重建「线路 ↔ 区域」映射</div>
				<div class="map-sub">
					按站点判断每条线路落在哪些区县，结果写入映射表。纯本地计算、不消耗高德配额，
					每天爬完新线路后点一次即可，可随时停止；下次重跑会自动从头清表重建。
				</div>
			</div>
			<div class="map-body">
				<el-button type="warning" :disabled="mapRunning" @click="startMapping">开始映射</el-button>
				<el-button v-if="mapRunning" type="danger" plain @click="mapStopped = true">停止</el-button>
			</div>
		</section>

		<!-- 映射进度 -->
		<section v-if="mapRunning || mapStats.total > 0" class="panel run">
			<div class="run-head">
				<div>
					<div class="run-title">映射进度</div>
					<div class="run-sub">
						{{ mapRunning ? `正在处理第 ${mapDone + 1} 个区县` : '已结束' }}
						· 已处理 {{ mapDone }} / {{ mapStats.total }} 个区县
						· 每批 {{ MAP_BATCH }} 个
					</div>
				</div>
				<el-tag :type="mapRunning ? 'warning' : 'success'" effect="light" round>
					{{ mapPercent }}%
				</el-tag>
			</div>
			<el-progress :percentage="mapPercent" :stroke-width="8" :status="mapRunning ? '' : 'success'" />
			<div class="stats">
				<div class="stat"><b>{{ mapDone }}</b><span>已处理区县</span></div>
				<div class="stat ok"><b>{{ mapStats.stopAreas }}</b><span>站点归属行</span></div>
				<div class="stat ok"><b>{{ mapStats.lineAreas }}</b><span>线路映射行</span></div>
				<div class="stat bad"><b>{{ mapStats.linesUnmapped }}</b><span>未覆盖线路</span></div>
			</div>
			<div class="log">
				<el-scrollbar max-height="200px">
					<div v-for="(line, i) in mapLog" :key="i" class="log-line">{{ line }}</div>
				</el-scrollbar>
			</div>
		</section>

		<!-- 按行政区查线路：懒加载树，点行选中该区域 -->
		<section class="panel area-panel">
			<div class="area-head">
				<div>
					<div class="area-title">按行政区查线路</div>
					<div class="area-sub">
						点箭头逐层展开，点行即选中该区域 —— 省 / 市 / 区县任意一层都会汇总它下面所有区县的线路
					</div>
				</div>
				<el-button v-if="selectedArea" text @click="clearArea">清除选择</el-button>
			</div>
			<el-table ref="areaTableRef" v-loading="areaLoading" :data="areaList" row-key="adcode" lazy
				:load="loadAreaChildren" :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
				:row-class-name="areaRowClass" max-height="340px" @row-click="onAreaClick">
				<template #empty>
					<div class="empty">
						<div class="empty-icon"></div>
						<div class="empty-title">没有区域数据</div>
						<div class="empty-sub">先到「行政区边界管理」页导入一份行政区数据</div>
					</div>
				</template>
				<el-table-column prop="name" label="区域" min-width="240">
					<template #default="{ row }">
						<span class="area-name">{{ row.name }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="adcode" label="adcode" width="110" class-name="col-center"
					label-class-name="col-center" />
				<el-table-column label="层级" width="100" class-name="col-center" label-class-name="col-center">
					<template #default="{ row }">
						<span class="lv" :class="`lv-${row.level || 'unknown'}`">{{ levelText(row.level) }}</span>
					</template>
				</el-table-column>
				<el-table-column label="" width="80" class-name="col-center" label-class-name="col-center">
					<template #default="{ row }">
						<span v-if="selectedArea?.adcode === row.adcode" class="area-current">当前</span>
					</template>
				</el-table-column>
			</el-table>
		</section>

		<!-- 线路列表 -->
		<section ref="listPanelRef" class="panel table-panel">
			<div class="list-head">
				<div>
					<div class="list-title">{{ selectedArea ? `${selectedArea.name} 的线路` : '全部线路' }}</div>
					<div class="list-sub">
						<template v-if="selectedArea">
							adcode {{ selectedArea.adcode }} · 含下级区县 {{ areaInfo?.districts ?? 0 }} 个
							· 命中 {{ total }} 条<template v-if="areaInfo && !areaInfo.hasBoundary"> · 该区域还没有边界</template>
						</template>
						<template v-else>关键词「{{ searchText || '（空）' }}」，城市 {{ city }}</template>
					</div>
				</div>
				<el-button v-if="selectedArea" text @click="clearArea">返回全部线路</el-button>
			</div>
			<el-table v-loading="loading" :data="list" :row-class-name="rowClass" @row-click="onRowClick">
				<template #empty>
					<div class="empty">
						<div class="empty-icon"></div>
						<template v-if="selectedArea">
							<div class="empty-title">{{ selectedArea.name }} 下没有线路</div>
							<div class="empty-sub">
								该区域（及其下级区县）还没有映射数据 —— 先确认边界已爬，再点上方「开始映射」
							</div>
						</template>
						<template v-else>
							<div class="empty-title">没有找到线路</div>
							<div class="empty-sub">填写关键词后点击「拉取并入库」，或调整查询条件试试</div>
						</template>
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

				<!-- 选中区域后才有的两列：这条线在该区域内是什么角色、覆盖了多少 -->
				<el-table-column v-if="selectedArea" label="角色" width="110" class-name="col-center"
					label-class-name="col-center">
					<template #default="{ row }">
						<span class="role" :class="`role-${roleKey(row)}`">{{ roleText(row) }}</span>
					</template>
				</el-table-column>
				<el-table-column v-if="selectedArea" label="覆盖" width="150" class-name="col-center"
					label-class-name="col-center">
					<template #default="{ row }">
						<span class="cover">{{ row.areaCount }} 区 · {{ row.stopNum }} 站</span>
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
					<span class="stop-no"
						:style="{ background: colorOf(detail.uicolor), color: contrastOn(detail.uicolor) }">{{ Number(i) + 1 }}</span>
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
const listPanelRef = ref<HTMLElement | null>(null)
const city = ref('0631')
const keyword = ref('1')
const searchText = ref('')

// ---- 按行政区查线路 ----
// 选中的区域（省 / 市 / 区县任意一层）。为 null 时列表就是原来的「全部线路」。
const selectedArea = ref<any>(null)
// byArea 接口带回来的区域信息（下级区县数、有没有边界）
const areaInfo = ref<any>(null)

const areaTableRef = ref<any>(null)
const areaList = ref<any[]>([])
const areaLoading = ref(false)

const LEVEL_TEXT: Record<string, string> = {
	country: '国家级', province: '省级', city: '市级', district: '区县级', street: '街道级'
}

function levelText(level: any): string {
	return LEVEL_TEXT[String(level ?? '')] ?? '—'
}

// 这条线在选中区域里的角色。isStart / isEnd 都是 1 = 首末站都在这个范围内
// （环线、短线很常见），不是「途经」。
function roleText(row: any): string {
	if (row?.isStart && row?.isEnd) return '始发+终到'
	if (row?.isStart) return '始发'
	if (row?.isEnd) return '终到'
	return '途经'
}

function roleKey(row: any): string {
	if (row?.isStart && row?.isEnd) return 'both'
	if (row?.isStart) return 'start'
	if (row?.isEnd) return 'end'
	return 'via'
}

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
		// 两个模式：选中了区域就查该区域（含下级区县）的线路，否则维持原来的关键词 / 城市查询
		const area = selectedArea.value
		const res = area
			? await request('/api/buslines/byArea', {
				query: { adcode: area.adcode, page: page.value, pageSize: pageSize.value }
			})
			: await request('/api/buslines', {
				query: {
					keyword: searchText.value,
					citycode: city.value,
					page: page.value,
					pageSize: pageSize.value
				}
			})
		list.value = res.data ?? []
		total.value = res.total ?? 0
		areaInfo.value = res.area ?? null
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

// 站点序号底色取自线路 UI 色，浅色底上白字会糊掉——
// 按 YIQ 亮度自动在白字与墨色字之间切换（色值无法解析时回退白字）
function contrastOn(c: any): string {
	const m = /^#?([0-9a-fA-F]{6})$/.exec(colorOf(c))
	if (!m || !m[1]) return '#fff'
	const v = parseInt(m[1], 16)
	const r = (v >> 16) & 255
	const g = (v >> 8) & 255
	const b = v & 255
	const yiq = (r * 299 + g * 587 + b * 114) / 1000
	return yiq > 150 ? 'var(--ink)' : '#fff'
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

// ---- 行政区树 ----
// 复用 districts 页的懒加载树接口：首层用 /districts（无筛选时默认给「中国」这一个根），
// 展开某一层时才去取它的下级。
async function loadAreaTree() {
	areaLoading.value = true
	try {
		const res = await request('/api/citycodes/districts')
		areaList.value = Array.isArray(res.data) ? res.data : []
	} finally {
		areaLoading.value = false
	}
}

async function loadAreaChildren(row: any, _node: any, resolve: (rows: any[]) => void) {
	if (!row?.adcode) {
		resolve([])
		return
	}
	const res = await request('/api/citycodes/districts/children', { query: { adcode: row.adcode } })
	resolve(Array.isArray(res.data) ? res.data : [])
}

// 只有「选中」的那一行高亮。展开箭头点的是图标，EP 自己 stopPropagation，
// 所以点箭头展开、点行选中，两者不冲突。
function areaRowClass({ row }: { row: any }) {
	return row?.adcode === selectedArea.value?.adcode ? 'is-current' : ''
}

async function onAreaClick(row: any) {
	selectedArea.value = row
	page.value = 1
	await loadList()
	await nextTick()
	listPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function clearArea() {
	selectedArea.value = null
	areaInfo.value = null
	page.value = 1
	loadList()
}

// ---- 重建映射 ----
// 分批调用后端：每批处理若干个区县，进度条因此是真实进度。
// 第一批（offset=0）会清空两张表，最后一批之后由后端派生线路表。
const MAP_BATCH = 150

const mapRunning = ref(false)
const mapStopped = ref(false)
const mapDone = ref(0)
const mapLog = ref<string[]>([])
const mapStats = ref({ total: 0, stopAreas: 0, lineAreas: 0, linesUnmapped: 0 })

const mapPercent = computed(() =>
	mapStats.value.total ? Math.min(100, Math.round((mapDone.value / mapStats.value.total) * 100)) : 0
)

function mapPush(msg: string) {
	const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
	mapLog.value.push(`[${time}] ${msg}`)
	if (mapLog.value.length > 300) mapLog.value.shift()
}

async function startMapping() {
	if (mapRunning.value) return
	mapRunning.value = true
	mapStopped.value = false
	mapDone.value = 0
	mapLog.value = []
	mapStats.value = { total: 0, stopAreas: 0, lineAreas: 0, linesUnmapped: 0 }

	let offset = 0
	try {
		// 兜底上限：正常情况下 offset 一定会推进到 total，这里只防意外死循环
		for (let batch = 0; batch < 2000; batch++) {
			if (mapStopped.value) {
				mapPush('已手动停止（已处理的部分是有效的，重跑会清表重建）')
				break
			}

			const res = await request('/api/buslines/rebuildAreaMapping', {
				method: 'POST',
				body: { offset, limit: MAP_BATCH }
			})
			if (res?.code !== 200) {
				mapPush(`✗ 第 ${batch + 1} 批失败：${res?.msg ?? '未知错误'}`)
				break
			}

			const d: any = res.data ?? {}
			mapStats.value.total = d.total ?? mapStats.value.total
			mapStats.value.stopAreas = d.stopAreas ?? 0
			mapDone.value = (d.offset ?? 0) + (d.processed ?? 0)
			// 后端一批都没处理说明已经到底了，避免原地打转
			if (!d.processed) break

			offset = mapDone.value

			if (d.finished) {
				mapStats.value.lineAreas = d.lineAreas ?? 0
				mapStats.value.linesUnmapped = d.linesUnmapped ?? 0
				mapPush(
					`✓ 完成：${d.total} 个区县，线路映射 ${d.lineAreas} 行，` +
					`覆盖 ${d.linesMapped} 条线路，未覆盖 ${d.linesUnmapped} 条`
				)
				if (d.multiAreaStops) {
					mapPush(`⚠ 有 ${d.multiAreaStops} 个站点落在多个区县，建议查一下边界数据是否重叠`)
				}
				break
			}

			mapPush(`已处理 ${mapDone.value}/${mapStats.value.total} 个区县，站点归属累计 ${mapStats.value.stopAreas} 行`)
		}
	} finally {
		mapRunning.value = false
	}

	// 映射结果变了，当前列表要重取（选中区域时尤其明显）
	await loadList()
}

onMounted(async () => {
	await loadNum()
	await loadList()
	await loadAreaTree()
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

