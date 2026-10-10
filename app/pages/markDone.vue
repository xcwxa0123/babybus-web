<template>
	<div class="markdone">
		<!-- 页面标题（不要用 <header>，全局 index.css 里 header 是吸顶栏样式） -->
		<div class="page-head">
			<div class="page-title-wrap">
				<h2 class="page-title"><span class="logo-dot" />城市拉取标记</h2>
				<span class="logo-en">Mark done</span>
			</div>
			<p class="page-meta">共 {{ total }} 条记录</p>
		</div>

		<!-- 操作区：查询 -->
		<section class="panel tools">
			<div class="tool-row">
				<div class="tool-name">查询<span>按 citycode 或状态筛选</span></div>
				<div class="tool-fields">
					<el-input v-model="filters.citycode" class="w-sm" placeholder="按 citycode 搜索" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<el-input v-model="filters.status" class="w-sm" placeholder="按 status 搜索" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<el-button type="primary" @click="onSearch">查询</el-button>
					<el-button @click="resetSearch">重置</el-button>
					<el-button @click="loadList">刷新列表</el-button>
				</div>
			</div>
		</section>

		<!-- 列表 -->
		<section class="panel table-panel">
			<el-table v-loading="loading" :data="list">
				<template #empty>
					<div class="empty">
						<div class="empty-icon"></div>
						<div class="empty-title">没有找到记录</div>
						<div class="empty-sub">调整 citycode 或 status 条件后重试</div>
					</div>
				</template>
				<el-table-column label="citycode" width="110">
					<template #default="{ row }">
						{{ row.citycode ?? '-' }}
					</template>
				</el-table-column>
				<el-table-column prop="doneNum" label="已执行数量" min-width="140" show-overflow-tooltip>
					<template #default="{ row }">
						<span class="line-name">{{ row.doneNum }}</span>
					</template>
				</el-table-column>
				<el-table-column label="状态" width="110">
					<template #default="{ row }">
						<span class="status" :class="`status-${row.status}`">{{ statusText(row.status) }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="updatedAt" label="更新时间" min-width="170" />
				<el-table-column label="操作" width="90">
					<template #default="{ row }">
						<el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
					</template>
				</el-table-column>
			</el-table>
		</section>

		<!-- 分页 -->
		<div class="pager">
			<ClientOnly>
				<el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total"
					:page-size="pageSize" :current-page="page" :page-sizes="[10, 20, 50, 100]"
					@size-change="(s: number) => { pageSize = s; page = 1; loadList() }"
					@current-change="onPageChange" />
			</ClientOnly>
		</div>

		<!-- 编辑弹窗（复用全局 .app-dialog 公共样式） -->
		<el-dialog v-model="editDialog" class="app-dialog" title="编辑标记" width="600px">
			<el-form :model="editForm" label-width="90px">
				<el-form-item label="当前index"><el-input v-model="editForm.doneNum" /></el-form-item>
				<el-form-item label="状态">
					<el-select v-model="editForm.status" placeholder="完成状态">
						<el-option :value="0" label="未完成" />
						<el-option :value="1" label="进行中" />
						<el-option :value="2" label="已完成" />
					</el-select>
				</el-form-item>
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
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

// ---- 编辑弹窗 ----
const editDialog = ref(false)
const editForm = ref<any>({})

const filters = ref({ status: '', citycode: '' })

async function loadList() {
	loading.value = true
	try {
		const res = await request('/api/citycodes/doneStatus', {
			query: {
				...filters.value,
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

// ---- 编辑 ----
function openEdit(data: any) {
	editForm.value = { ...data }
	editDialog.value = true
}

// 保存
async function submitEdit() {
	await request(`/api/citycodes/saveDoneNum`, {
		method: 'POST',
		body: editForm.value
	})
	editDialog.value = false
	ElMessage.success('修改成功')
	loadList()
}

function statusText(status: any): string {
	const map: Record<number, string> = { 0: '未完成', 1: '进行中', 2: '已完成' }
	return map[Number(status)] ?? String(status ?? '-')
}

function onPageChange(p: number) {
	page.value = p
	loadList()
}

function onSearch() {
	page.value = 1 // 搜索时回到第一页
	loadList()
}

function resetSearch() {
	filters.value = { status: '', citycode: '' }
	page.value = 1
	loadList()
}

onMounted(loadList)
</script>
