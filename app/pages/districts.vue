<template>
	<div class="districts">
		<!-- 页面标题（注意：不要用 <header>，全局 index.css 里 header 是吸顶栏样式） -->
		<div class="page-head">
			<div class="page-title-wrap">
				<h2 class="page-title"><span class="logo-dot" />行政区边界管理</h2>
				<span class="logo-en">Administrative districts</span>
			</div>
			<p class="page-meta">
				共 {{ total }} 个区域，已录边界 {{ withBoundary }} 个<template v-if="hasQuery">，当前命中 {{ matched }} 项</template>
			</p>
		</div>

		<!-- 操作区：筛选 -->
		<section class="panel tools">
			<div class="tool-row">
				<div class="tool-name">筛选<span>按名称 / adcode / 层级 / 上级</span></div>
				<div class="tool-fields">
					<el-input v-model="filters.name" class="w-lg" placeholder="按名称搜索" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<el-input v-model="filters.adcode" class="w-sm" placeholder="adcode" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<!-- el-select 内部会挂 Tooltip，而 Element Plus 的 useTimeout 在 SSR 收尾阶段会执行
					     window.clearTimeout，服务端没有 window 会直接把渲染干掉，所以必须包进 ClientOnly。
					     其余页面把 select 放在弹窗里，弹窗不开就不渲染，天然绕开了这个坑。 -->
					<ClientOnly>
						<el-select v-model="filters.level" class="w-sm" placeholder="层级" clearable
							@change="onSearch">
							<el-option value="province" label="省级" />
							<el-option value="city" label="市级" />
							<el-option value="district" label="区县级" />
							<el-option value="street" label="街道级" />
						</el-select>
						<template #fallback>
							<el-input class="w-sm" placeholder="层级" disabled />
						</template>
					</ClientOnly>
					<el-input v-model="filters.parentAdcode" class="w-sm" placeholder="上级 adcode" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<el-button type="primary" @click="onSearch">查询</el-button>
					<el-button @click="resetSearch">重置</el-button>
					<el-button @click="loadList">刷新列表</el-button>
				</div>
			</div>
		</section>

		<!-- 批量导入：重入口，独立次级面板 -->
		<section class="panel import-panel">
			<div>
				<div class="import-title">批量导入行政区</div>
				<div class="import-sub">粘贴高德行政区接口返回的 JSON，自动解析出 adcode / 名称 / 层级 / 父子关系 / 边界后入库</div>
			</div>
			<div class="import-body">
				<el-button type="warning" @click="openImport">粘贴数据导入</el-button>
			</div>
		</section>

		<!-- 区域列表 -->
		<section class="panel table-panel">
			<!-- lazy + :load：树是按需长的——点开某一行才去查它下一层，
			     所以接口只给当层数据，不用一次性把整棵树端回来。
			     row-key 必须有（懒加载靠它记展开状态）；hasChildren 决定要不要画展开箭头。
			     row-click：整行都能点开（箭头自己的 click 是 stopPropagation 的，不会重复触发）。
			     max-height：给个自适应高度让表格内部滚动、表头吸顶。 -->
			<el-table ref="tableRef" v-loading="loading" :data="list" row-key="id" lazy
				:load="loadChildren" :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
				:row-class-name="rowClassName" @row-click="onRowClick"
				max-height="clamp(420px, calc(100vh - 360px), 860px)">
				<template #empty>
					<div class="empty">
						<div class="empty-icon"></div>
						<div class="empty-title">没有找到区域</div>
						<div class="empty-sub">调整筛选条件，或先用右上角「粘贴数据导入」灌一份行政区数据</div>
					</div>
				</template>
				<el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip>
					<template #default="{ row }">
						<span class="area-name">{{ row.name }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="adcode" label="adcode" width="110" class-name="col-center"
					label-class-name="col-center" />
				<el-table-column label="层级" width="90" class-name="col-center"
					label-class-name="col-center">
					<template #default="{ row }">
						<span class="lv" :class="`lv-${row.level || 'unknown'}`">{{ levelText(row.level) }}</span>
					</template>
				</el-table-column>
				<el-table-column label="上级" min-width="180" show-overflow-tooltip>
					<template #default="{ row }">
						<template v-if="row.parentAdcode">
							<span class="parent-name">{{ row.parentName || '未知区域' }}</span>
							<span class="parent-code">{{ row.parentAdcode }}</span>
						</template>
						<span v-else class="dash">—</span>
					</template>
				</el-table-column>
				<!-- 线路收录：数据来自 done_num_citycode，按 citycode 关联。
				     citycode 是城市级的，所以同城的市 / 区县会显示同一个状态（已确认要这样）。 -->
				<el-table-column label="线路收录" width="140" class-name="col-center"
					label-class-name="col-center">
					<template #default="{ row }">
						<span class="done" :class="`done-${row.doneStatus}`">
							{{ doneText(row.doneStatus) }}
							<!-- 数字只在两种情况下显示：
							     未开始的进度恒为 0/999 没信息量；
							     汇总行（国家 / 省级）是按下属层级推出来的，本身没有单项进度 -->
							<b v-if="row.doneStatus > 0 && row.doneNum != null" class="done-num">{{ row.doneNum }}/{{ row.totalNum }}</b>
						</span>
					</template>
				</el-table-column>
				<el-table-column label="边界" width="110" class-name="col-num"
					label-class-name="col-num">
					<template #default="{ row }">
						<span v-if="row.polyPoints > 0" class="pts">{{ row.polyPoints }} 点</span>
						<span v-else class="none">未录入</span>
					</template>
				</el-table-column>
				<el-table-column label="citycode" width="100" class-name="col-center"
					label-class-name="col-center">
					<template #default="{ row }">{{ row.citycode || '-' }}</template>
				</el-table-column>
				<el-table-column label="操作" width="110" class-name="col-center"
					label-class-name="col-center">
					<template #default="{ row }">
						<!-- stop：别让点按钮顺带把这一行也展开/收起了 -->
						<el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
					</template>
				</el-table-column>
			</el-table>
		</section>

		<!-- 列表改成了父子树形态，不再分页（树一旦分页，语义就乱了） -->

		<!-- 编辑弹窗 -->
		<el-dialog v-model="editDialog" class="app-dialog" title="编辑行政区" width="720px">
			<el-form :model="editForm" label-width="96px">
				<el-form-item label="名称">
					<span class="form-static">{{ editForm.name }}</span>
				</el-form-item>
				<el-form-item label="adcode">
					<span class="form-static">{{ editForm.adcode || '-' }}</span>
				</el-form-item>
				<el-form-item label="层级">
					<el-select v-model="editForm.level" placeholder="选择层级" clearable>
						<el-option value="province" label="省级" />
						<el-option value="city" label="市级" />
						<el-option value="district" label="区县级" />
						<el-option value="street" label="街道级" />
					</el-select>
				</el-form-item>
				<el-form-item label="上级 adcode">
					<div class="parent-row">
						<el-input v-model="editForm.parentAdcode" placeholder="留空表示顶层" clearable />
						<el-button @click="deriveParent">按位数推导</el-button>
					</div>
				</el-form-item>
				<el-form-item label="边界坐标">
					<el-input v-model="editForm.polyline" type="textarea" :rows="10"
						placeholder="lng,lat;lng,lat;…（多环用 | 分隔）" />
					<div class="boundary-tip">
						当前 {{ editFormPoints }} 个点 · 保存时自动清洗非法点并压缩多余小数
					</div>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="editDialog = false">取消</el-button>
				<el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
			</template>
		</el-dialog>

		<!-- 批量导入弹窗 -->
		<el-dialog v-model="importDialog" class="app-dialog" title="批量导入行政区" width="760px"
			:close-on-click-modal="!importing" :close-on-press-escape="!importing">
			<el-input v-model="importRaw" type="textarea" :rows="10"
				placeholder="把高德行政区接口返回的 JSON 整段粘进来即可，会自动递归解析 districts 层级" />
			<div class="import-tip">
				<template v-if="parsedItems.length">
					已解析 {{ parsedItems.length }} 条，其中带边界 {{ parsedWithBoundary }} 条
					<div class="ip-plan">
						将分 {{ batchPlan.batches.length }} 批提交（单批不超过 {{ batchBytesKb }}KB，避开网关的请求体上限）
					</div>
					<div v-if="batchPlan.oversized.length" class="import-warn">
						有 {{ batchPlan.oversized.length }} 条单条就超过 {{ batchBytesKb }}KB：{{ oversizedPreview }}。
						它们会各自单独成批，但仍可能被网关拒绝——这种超长边界建议改用按 adcode 逐个拉取的方式录入。
					</div>
					<div v-if="parsedWithBoundary < parsedItems.length" class="import-warn">
						高德的行政区接口默认只下发「被查询那一级」的边界，子级节点的 polyline 基本是空的
						（实测查一个省：1 省 + 16 市 + 136 区县，只有省本身带边界）。
						要补齐市 / 区县边界，得按 adcode 逐个单独请求。
					</div>
				</template>
				<template v-else-if="parseError">{{ parseError }}</template>
				<template v-else>粘贴后先点「解析预览」，确认无误再导入</template>
			</div>
			<div v-if="parsedItems.length" class="preview">
				<div v-for="it in parsedItems.slice(0, 5)" :key="it.adcode" class="preview-row">
					<span class="p-name">{{ it.name }}</span>
					<span class="p-code">{{ it.adcode }}</span>
					<span class="p-lv">{{ levelText(it.level) }}</span>
					<span class="p-pts">{{ pointCount(it.polyline) }} 点</span>
				</div>
				<div v-if="parsedItems.length > 5" class="preview-more">…仅预览前 5 条</div>
			</div>

			<!-- 分批提交是几十次往返，没有进度会让人以为卡死了 -->
			<div v-if="importing || importProgress.total" class="import-progress">
				<div class="ip-head">
					<span>{{ importState.text }}</span>
					<span class="ip-count">{{ importProgress.done }} / {{ importProgress.total }} 批</span>
				</div>
				<el-progress :percentage="importPercent" :stroke-width="8" :status="importState.status" />
				<div class="ip-stats">
					<span>新增 {{ importProgress.inserted }}</span>
					<span>更新 {{ importProgress.updated }}</span>
					<span>跳过 {{ importProgress.skipped }}</span>
					<span v-if="importing" class="ip-hint">正在分批提交，跑完前别关页面</span>
				</div>
			</div>

			<div v-if="importError" class="import-warn">
				<div v-for="(line, i) in importError.split('\n')" :key="i">{{ line }}</div>
			</div>

			<template #footer>
				<el-button :disabled="importing" @click="importDialog = false">取消</el-button>
				<el-button :disabled="importing" @click="doParse">解析预览</el-button>
				<el-button type="primary" :disabled="!parsedItems.length" :loading="importing"
					@click="submitImport">
					{{ importError ? '重试导入' : '确认导入' }}
				</el-button>
			</template>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
const LEVEL_TEXT: Record<string, string> = {
	province: '省级',
	city: '市级',
	district: '区县级',
	street: '街道级'
}

const list = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const importing = ref(false)

const total = ref(0)
const withBoundary = ref(0)
const matched = ref(0)
// 本次结果是不是「没填任何筛选条件」拿到的（服务端会默认落到中国那个根节点）
const defaulted = ref(true)

const filters = ref({ name: '', adcode: '', level: '', parentAdcode: '' })

const hasQuery = computed(
	() => !!(filters.value.name || filters.value.adcode || filters.value.level || filters.value.parentAdcode)
)

// done_num_citycode.status：0 未开始 / 1 进行中 / 2 已完成
// （0 那一批是建库时给每个城市插的占位行，显示成「未开始」是对的）
const DONE_TEXT: Record<number, string> = { 0: '未开始', 1: '进行中', 2: '已完成' }

function levelText(level: any): string {
	return LEVEL_TEXT[String(level ?? '')] ?? '—'
}

function doneText(status: any): string {
	return DONE_TEXT[Number(status)] ?? '—'
}

// 每个点恰好一个逗号，所以数逗号比数分号准（多环时数分号会少算）
function pointCount(polyline: any): number {
	const s = String(polyline ?? '')
	return s ? s.split(',').length - 1 : 0
}

async function loadList() {
	loading.value = true
	try {
		const res = await request('/api/citycodes/districts', {
			query: {
				name: filters.value.name || undefined,
				adcode: filters.value.adcode || undefined,
				level: filters.value.level || undefined,
				parentAdcode: filters.value.parentAdcode || undefined
			}
		})
		// 接口统一返回已经组好的父子树，前端直接渲染
		list.value = Array.isArray(res.data) ? res.data : []
		total.value = res.total ?? 0
		withBoundary.value = res.withBoundary ?? 0
		matched.value = res.matched ?? list.value.length
		defaulted.value = res.defaulted ?? false
	} finally {
		loading.value = false
	}
}

const tableRef = ref<any>(null)

// 点整行就能展开 / 收起。
// EP 的展开箭头在自己的 click 里做了 stopPropagation，所以这里不会和它重复触发；
// 而 toggleRowExpansion 内部走的是 toggleTreeExpansion，懒加载取数就在那条路径上
// （tree.mjs: expanded && isUseLazy(data) && loadData(...)），不用手动去调 load。
function onRowClick(row: any) {
	if (!row?.hasChildren) return
	tableRef.value?.toggleRowExpansion(row)
}

// 只有「有子级」的行给手型光标，叶子行不误导用户去点
function rowClassName({ row }: { row: any }) {
	return row?.hasChildren ? 'is-expandable' : ''
}

// 懒加载：点开某一行才去拉它下面的直接子级。
// EP 会把 resolve 的结果缓存在自己那棵树里，收起再展开不会重复请求
async function loadChildren(row: any, _treeNode: any, resolve: (rows: any[]) => void) {
	if (!row?.adcode) {
		resolve([])
		return
	}
	const res = await request('/api/citycodes/districts/children', {
		query: { adcode: row.adcode }
	})
	resolve(Array.isArray(res.data) ? res.data : [])
}

function onSearch() {
	loadList()
}

function resetSearch() {
	filters.value = { name: '', adcode: '', level: '', parentAdcode: '' }
	loadList()
}

// ---- 编辑 ----
const editDialog = ref(false)
const editForm = ref<any>({})

const editFormPoints = computed(() => pointCount(editForm.value.polyline))

async function openEdit(row: any) {
	editForm.value = {
		id: row.id,
		name: row.name,
		adcode: row.adcode,
		level: row.level ?? '',
		parentAdcode: row.parentAdcode ?? '',
		polyline: ''
	}
	editDialog.value = true
	// 列表接口不带 polyline 正文，单条取回来再填，避免一页拖回几十万字符
	const res = await request(`/api/citycodes/districts/${row.id}`)
	if (res?.code === 200 && res.data) {
		editForm.value = {
			...editForm.value,
			level: res.data.level ?? '',
			parentAdcode: res.data.parentAdcode ?? '',
			polyline: res.data.polyline ?? ''
		}
	}
}

// 按 adcode 位数推导上级：省级 XX0000、市级 XXXX00。
// 直辖市 / 省直辖县的父级不一定在库里，推导结果只当建议，允许手动改。
function deriveParent() {
	const code = String(editForm.value.adcode ?? '').trim()
	const lv = String(editForm.value.level ?? '')
	if (code.length !== 6) {
		ElMessage.info('adcode 不是 6 位，没法推导')
		return
	}
	if (lv === 'city') {
		editForm.value.parentAdcode = `${code.slice(0, 2)}0000`
	} else if (lv === 'district') {
		editForm.value.parentAdcode = `${code.slice(0, 4)}00`
	} else if (lv === 'street') {
		editForm.value.parentAdcode = code
	} else {
		ElMessage.info('先选择层级再推导')
	}
}

async function submitEdit() {
	saving.value = true
	try {
		const res = await request(`/api/citycodes/districts/${editForm.value.id}`, {
			method: 'PUT',
			body: {
				level: editForm.value.level || null,
				parentAdcode: editForm.value.parentAdcode || null,
				polyline: editForm.value.polyline || null
			}
		})
		if (res?.code === 200) {
			ElMessage.success('已保存')
			editDialog.value = false
			loadList()
		} else {
			ElMessage.error(`保存失败：${res?.msg ?? '未知错误'}`)
		}
	} finally {
		saving.value = false
	}
}

// ---- 批量导入 ----
// 单批请求体的字节上限。nginx 的 client_max_body_size 默认是 1m，
// 整份全国数据一次 POST 必然被网关挡在门外（413），所以按体积切成多批提交。
// 取 512KB 是给默认上限留一半余量——请求体之外还有请求头，别卡着线走。
const BATCH_BYTES = 512 * 1024
const batchBytesKb = Math.round(BATCH_BYTES / 1024)

const importDialog = ref(false)
const importRaw = ref('')
const parsedItems = ref<any[]>([])
const parseError = ref('')
const importError = ref('')

// 解析后就算好分批方案：提交前就能告诉用户要跑几批、有没有单条就超限的刺头
const batchPlan = ref<{ batches: any[][]; oversized: any[] }>({ batches: [], oversized: [] })

const importProgress = ref({ done: 0, total: 0, inserted: 0, updated: 0, skipped: 0 })
const importPercent = computed(() => {
	const { done, total } = importProgress.value
	return total ? Math.min(100, Math.round((done / total) * 100)) : 0
})

// 进度面板的收尾状态：中断了不能还挂个绿勾
const importState = computed(() => {
	if (importing.value) return { text: '导入中', status: '' as const }
	if (importError.value) return { text: '已中断', status: 'exception' as const }
	return { text: '已结束', status: 'success' as const }
})

const oversizedPreview = computed(() => {
	const list = batchPlan.value.oversized
	const head = list.slice(0, 3).map((it: any) => `${it.adcode} ${it.name}`).join('、')
	return list.length > 3 ? `${head} 等` : head
})

const parsedWithBoundary = computed(
	() => parsedItems.value.filter((it) => pointCount(it.polyline) > 0).length
)

// request() 把异常兜成了 { code: 401, msg: error }，而 msg 往往是个 FetchError 对象，
// 直接插值会渲染成 [object Object]，这里统一提成能读的一行
function errText(e: any): string {
	if (!e) return '未知错误'
	if (typeof e === 'string') return e
	return e?.message || e?.statusMessage || e?.data?.msg || '未知错误'
}

// 按「序列化后的实际字节数」贪心切批，而不是按条数——
// 边界字符串的体积能差四五个数量级（一个省边界几十万字符，一个区县名几十字节），
// 按条数切会在碰上大边界时整批超限；按体积切则大边界自己单独成批。
// 单条就超过上限的会进 oversized 名单：仍然单独成批尽力一试（调用方的网关未必是默认值），
// 但提前告诉用户，免得跑了几十批才在它身上翻车。
function packBatches(items: any[]): { batches: any[][]; oversized: any[] } {
	const enc = new TextEncoder()
	const batches: any[][] = []
	const oversized: any[] = []
	let cur: any[] = []
	let curSize = 2 // 数组外壳的一对中括号

	for (const it of items) {
		let size: number
		try {
			size = enc.encode(JSON.stringify(it) ?? '').length + 1 // +1 是分隔逗号
		} catch {
			size = 0
		}
		if (size > BATCH_BYTES - 2) oversized.push(it)
		if (cur.length && curSize + size > BATCH_BYTES) {
			batches.push(cur)
			cur = []
			curSize = 2
		}
		cur.push(it)
		curSize += size
	}
	if (cur.length) batches.push(cur)
	return { batches, oversized }
}

function openImport() {
	importRaw.value = ''
	parsedItems.value = []
	parseError.value = ''
	importError.value = ''
	batchPlan.value = { batches: [], oversized: [] }
	importProgress.value = { done: 0, total: 0, inserted: 0, updated: 0, skipped: 0 }
	importDialog.value = true
}

// 递归拍平高德的行政区结构：
// 响应形如 { status, districts: [ { adcode, name, level, polyline, districts: [...] } ] }
// 同时兼容裸数组 / 单个对象 / children 字段命名
function flattenDistricts(data: any): any[] {
	const out: any[] = []
	const seen = new Set<string>()

	const walk = (nodes: any, parentAdcode: string | null) => {
		if (!Array.isArray(nodes)) return
		for (const n of nodes) {
			if (!n || typeof n !== 'object') continue
			const adcode = String(n.adcode ?? '').trim()
			const name = String(n.name ?? '').trim()
			if (adcode && name && !seen.has(adcode)) {
				seen.add(adcode)
				out.push({
					adcode,
					name,
					level: n.level ?? null,
					citycode: n.citycode ?? null,
					parentAdcode,
					polyline: n.polyline ?? null
				})
			}
			walk(n.districts ?? n.children, adcode || parentAdcode)
		}
	}

	const roots = Array.isArray(data) ? data : Array.isArray(data?.districts) ? data.districts : [data]
	walk(roots, null)
	return out
}

function doParse() {
	parseError.value = ''
	parsedItems.value = []

	const text = importRaw.value.trim()
	if (!text) {
		parseError.value = '请先粘贴 JSON'
		return
	}

	let data: any
	try {
		data = JSON.parse(text)
	} catch (e: any) {
		parseError.value = `JSON 解析失败：${e?.message ?? e}`
		return
	}

	const items = flattenDistricts(data)
	if (!items.length) {
		parseError.value = '没解析到任何行政区，确认一下粘贴的是不是高德的行政区返回'
		return
	}
	parsedItems.value = items
	// 解析时顺手把分批方案算好（要全量序列化一遍，放这儿只做一次）
	batchPlan.value = packBatches(items)
	importError.value = ''
	importProgress.value = { done: 0, total: 0, inserted: 0, updated: 0, skipped: 0 }
}

async function submitImport() {
	// 解析时已算过，这里直接用；万一没有（理论上不会，按钮没解析不让点）就现算一份
	const batches = batchPlan.value.batches.length
		? batchPlan.value.batches
		: packBatches(parsedItems.value).batches
	if (!batches.length) {
		ElMessage.error('没有可导入的数据')
		return
	}

	importing.value = true
	importError.value = ''
	importProgress.value = { done: 0, total: batches.length, inserted: 0, updated: 0, skipped: 0 }

	try {
		// 一批一批串行发：不再有单个超大请求体；串行也让进度和配额都可控
		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i]
			if (!batch?.length) continue

			const res = await request('/api/citycodes/districts/import', {
				method: 'POST',
				body: { items: batch }
			})

			if (res?.code !== 200) {
				// 失败就停在当前批，不继续往下跑（多半是体积之外的系统性问题，继续也是白跑）。
				// 已完成的批次是真落库的，而导入接口按 adcode upsert —— 重跑一遍即可补齐，不会重复入库。
				const { done, inserted, updated, skipped } = importProgress.value
				importError.value =
					`第 ${i + 1}/${batches.length} 批失败（本批 ${batch.length} 条）：${errText(res?.msg)}\n`
					+ `已完成 ${done} 批，累计新增 ${inserted} · 更新 ${updated} · 跳过 ${skipped}。\n`
					+ '导入按 adcode 覆盖，修掉问题后直接点「重试导入」再跑一遍即可，不会重复入库。'
				ElMessage.error(`导入中断：第 ${i + 1}/${batches.length} 批失败`)
				return
			}

			const { inserted = 0, updated = 0, skipped = 0 } = res.data ?? {}
			importProgress.value = {
				done: i + 1,
				total: batches.length,
				inserted: importProgress.value.inserted + inserted,
				updated: importProgress.value.updated + updated,
				skipped: importProgress.value.skipped + skipped
			}
		}

		const { inserted, updated, skipped } = importProgress.value
		ElMessage.success(`导入完成：新增 ${inserted}，更新 ${updated}，跳过 ${skipped}`)
		importDialog.value = false
		loadList()
	} finally {
		importing.value = false
	}
}

onMounted(loadList)
</script>
