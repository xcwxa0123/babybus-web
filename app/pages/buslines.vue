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

		<!-- 数据任务：低频、会消耗配额的重操作，收在同一个面板里 -->
		<section class="panel task-panel" :class="{ running: pullRunning || mapRunning }">
			<el-tabs v-model="taskTab" class="task-tabs">
				<el-tab-pane name="pull">
					<template #label>
						<span class="task-tab">拉取入库<i v-if="pullRunning" class="run-dot" /></span>
					</template>
					<TaskPull ref="pullRef" v-model:city="city" @running="pullRunning = $event" @changed="loadList" />
				</el-tab-pane>
				<el-tab-pane name="map">
					<template #label>
						<span class="task-tab">区域映射<i v-if="mapRunning" class="run-dot" /></span>
					</template>
					<TaskMapping @running="mapRunning = $event" @changed="loadList" />
				</el-tab-pane>
			</el-tabs>
		</section>

		<!-- 浏览区：左边选行政区，右边看线路 -->
		<div class="layout">
			<aside class="side">
				<AreaPanel :selected="selectedArea" @select="selectArea" @clear="clearArea" />
			</aside>

			<div class="main">
				<section ref="listPanelRef" class="panel table-panel">
					<div class="list-head">
						<div>
							<div class="list-title">{{ selectedArea ? `${selectedArea.name} 的线路` : '全部线路' }}</div>
							<div class="list-sub">
								<template v-if="selectedArea">
									adcode {{ selectedArea.adcode }} · 含下级区县 {{ areaInfo?.districts ?? 0 }} 个
									· 命中 {{ total }} 条<template v-if="areaInfo && !areaInfo.hasBoundary"> · 该区域还没有边界</template>
								</template>
								<template v-else>城市 {{ city }}</template>
							</div>
						</div>
						<el-button v-if="selectedArea" text @click="clearArea">返回全部线路</el-button>
					</div>

					<LineTable :list="list" :loading="loading" :selected-area="selectedArea"
						:active-id="detailOpen ? detail?.id : ''" @row-click="openDetail" @changed="loadList"
						@removed="onRemoved" />
				</section>

				<!-- 分页懒加载 -->
				<div class="pager">
					<ClientOnly>
						<el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total"
							:page-size="pageSize" :current-page="page" :page-sizes="[10, 20, 50, 100]"
							@size-change="onSizeChange" @current-change="onPageChange" />
					</ClientOnly>
				</div>
			</div>
		</div>

		<!-- 线路详情：右侧抽屉 -->
		<LineDetail v-model="detailOpen" :detail="detail" :loading="detailLoading" />
	</div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AreaPanel from './components/buslines/AreaPanel.vue'
import LineDetail from './components/buslines/LineDetail.vue'
import LineTable from './components/buslines/LineTable.vue'
import TaskMapping from './components/buslines/TaskMapping.vue'
import TaskPull from './components/buslines/TaskPull.vue'

// 本页只管三件事：布局、列表（含分页 / 行政区筛选）、详情抽屉。
// 拉取 / 映射两类重任务的状态和逻辑分别封在 TaskPull / TaskMapping 里。

// ---- 数据任务 ----
const taskTab = ref('pull')
const pullRunning = ref(false)
const mapRunning = ref(false)
const pullRef = ref<InstanceType<typeof TaskPull> | null>(null)

// ---- 列表 ----
const city = ref('0631') // 进页面时会被 TaskPull.loadNum 换成上次拉到的 citycode
const list = ref<any[]>([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const loading = ref(false)
const listPanelRef = ref<HTMLElement | null>(null)

// 选中的区域（省 / 市 / 区县任意一层）。为 null 时列表就是「全部线路」。
const selectedArea = ref<any>(null)
// byArea 接口带回来的区域信息（下级区县数、有没有边界）
const areaInfo = ref<any>(null)

async function loadList() {
	loading.value = true
	try {
		// 两个模式：选中了区域就查该区域（含下级区县）的线路，否则按城市查询
		const area = selectedArea.value
		const res = area
			? await request('/api/buslines/byArea', {
				query: { adcode: area.adcode, page: page.value, pageSize: pageSize.value }
			})
			: await request('/api/buslines', {
				query: {
					keyword: '',
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

function onSizeChange(s: number) {
	pageSize.value = s
	page.value = 1
	loadList()
}

async function selectArea(row: any) {
	selectedArea.value = row
	page.value = 1
	await loadList()
	// 窄屏时左右两栏会叠成上下，选完区域把列表滚到可见处
	if (window.matchMedia('(max-width: 1024px)').matches) {
		listPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}
}

function clearArea() {
	selectedArea.value = null
	areaInfo.value = null
	page.value = 1
	loadList()
}

// ---- 详情抽屉 ----
const detail = ref<any>(null)
const detailOpen = ref(false)
const detailLoading = ref(false)
let detailSeq = 0 // 连续点不同的行时，只认最后一次请求的结果

async function openDetail(row: any) {
	const seq = ++detailSeq
	detailOpen.value = true
	detailLoading.value = true
	detail.value = { id: row.id, name: row.name } // 先用行数据把标题顶上，站点随后补
	try {
		const res = await request(`/api/buslines/${row.id}`)
		if (seq === detailSeq) detail.value = res.data
	} finally {
		if (seq === detailSeq) detailLoading.value = false
	}
}

function onRemoved(id: string) {
	if (detail.value?.id === id) detailOpen.value = false
}

// 先拿到上次拉取的 citycode，再按它加载列表（行政区树由 AreaPanel 自己加载）
onMounted(async () => {
	try {
		await pullRef.value?.loadNum()
	} finally {
		await loadList()
	}
})
</script>
