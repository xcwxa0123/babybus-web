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
			     max-height：给个自适应高度让表格内部滚动、表头吸顶。 -->
			<el-table v-loading="loading" :data="list" row-key="id" lazy :load="loadChildren"
				:tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
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
						<el-button size="small" @click="openEdit(row)">编辑</el-button>
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
		<el-dialog v-model="importDialog" class="app-dialog" title="批量导入行政区" width="760px">
			<el-input v-model="importRaw" type="textarea" :rows="10"
				placeholder="把高德行政区接口返回的 JSON 整段粘进来即可，会自动递归解析 districts 层级" />
			<div class="import-tip">
				<template v-if="parsedItems.length">
					已解析 {{ parsedItems.length }} 条，其中带边界 {{ parsedWithBoundary }} 条
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
			<template #footer>
				<el-button @click="importDialog = false">取消</el-button>
				<el-button @click="doParse">解析预览</el-button>
				<el-button type="primary" :disabled="!parsedItems.length" :loading="importing"
					@click="submitImport">
					确认导入
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

function levelText(level: any): string {
	return LEVEL_TEXT[String(level ?? '')] ?? '—'
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
const importDialog = ref(false)
const importRaw = ref('')
const parsedItems = ref<any[]>([])
const parseError = ref('')

const parsedWithBoundary = computed(
	() => parsedItems.value.filter((it) => pointCount(it.polyline) > 0).length
)

function openImport() {
	importRaw.value = ''
	parsedItems.value = []
	parseError.value = ''
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
}

async function submitImport() {
	importing.value = true
	try {
		const res = await request('/api/citycodes/districts/import', {
			method: 'POST',
			body: { items: parsedItems.value }
		})
		if (res?.code === 200) {
			const { inserted, updated, skipped } = res.data
			ElMessage.success(`导入完成：新增 ${inserted}，更新 ${updated}，跳过 ${skipped}`)
			importDialog.value = false
			loadList()
		} else {
			ElMessage.error(`导入失败：${res?.msg ?? '未知错误'}`)
		}
	} finally {
		importing.value = false
	}
}

onMounted(loadList)
</script>
