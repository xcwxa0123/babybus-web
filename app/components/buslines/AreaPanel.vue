<template>
	<!-- 按行政区查线路：懒加载树，点箭头展开下级，点行选中该区域 -->
	<section class="panel area-panel">
		<div class="area-head">
			<div>
				<div class="area-title">按行政区查线路</div>
				<div class="area-sub">点箭头展开下级，点名称选中。省 / 市 / 区县任意一层都会汇总其下所有区县的线路</div>
			</div>
			<el-button v-if="selected" text size="small" @click="emit('clear')">清除选择</el-button>
		</div>

		<el-table ref="tableRef" v-loading="loading" :data="areaList" row-key="adcode" lazy :load="loadChildren"
			:tree-props="{ children: 'children', hasChildren: 'hasChildren' }" :show-header="false"
			:row-class-name="rowClass" max-height="62vh" @row-click="(row: any) => emit('select', row)">
			<template #empty>
				<div class="empty">
					<div class="empty-icon"></div>
					<div class="empty-title">没有区域数据</div>
					<div class="empty-sub">先到「行政区边界管理」页导入一份行政区数据</div>
				</div>
			</template>
			<el-table-column prop="name" label="区域" min-width="200">
				<template #default="{ row }">
					<!-- 注意：树表格里图标和内容在同一行内联排列，这里只能用 span，不能用块级元素 -->
					<span class="area-name">{{ row.name }}</span>
					<span class="lv" :class="`lv-${row.level || 'unknown'}`">{{ levelText(row.level) }}</span>
				</template>
			</el-table-column>
		</el-table>
	</section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { levelText } from '~/utils/busline'

const props = defineProps<{ selected: any }>()
const emit = defineEmits<{
	select: [row: any]
	clear: []
}>()

const tableRef = ref<any>(null)
const areaList = ref<any[]>([])
const loading = ref(false)

// 复用 districts 页的懒加载树接口：首层用 /districts（无筛选时默认给「中国」这一个根），
// 展开某一层时才去取它的下级。
async function loadTree() {
	loading.value = true
	try {
		const res = await request('/api/citycodes/districts')
		areaList.value = Array.isArray(res.data) ? res.data : []
	} finally {
		loading.value = false
	}
	expandRoot()
}

async function loadChildren(row: any, _node: any, resolve: (rows: any[]) => void) {
	if (!row?.adcode) {
		resolve([])
		return
	}
	const res = await request('/api/citycodes/districts/children', { query: { adcode: row.adcode } })
	resolve(Array.isArray(res.data) ? res.data : [])
}

// 只有一个根（「中国」）时默认展开一层，省份直接可见。
// 展开失败不影响使用，用户手动点箭头即可。
async function expandRoot() {
	await nextTick()
	const root = areaList.value.length === 1 ? areaList.value[0] : null
	if (!root?.hasChildren) return
	try {
		tableRef.value?.toggleRowExpansion(root, true)
	} catch {
		// ignore
	}
}

// 只有「选中」的那一行高亮。展开箭头点的是图标，EP 自己 stopPropagation，
// 所以点箭头展开、点行选中，两者不冲突。
function rowClass({ row }: { row: any }) {
	return row?.adcode === props.selected?.adcode ? 'is-current' : ''
}

onMounted(loadTree)
</script>
