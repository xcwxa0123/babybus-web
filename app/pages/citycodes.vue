<template>
	<div class="citycodes">
		<!-- 页面标题（不要用 <header>，全局 index.css 里 header 是吸顶栏样式） -->
		<div class="page-head">
			<div class="page-title-wrap">
				<h2 class="page-title"><span class="logo-dot" />城市编码本地库</h2>
				<span class="logo-en">City codes</span>
			</div>
			<p class="page-meta">共 {{ total }} 条记录，adcode / citycode</p>
		</div>

		<!-- 操作区：查询 -->
		<section class="panel tools">
			<div class="tool-row">
				<div class="tool-name">查询<span>按名称、adcode 或 citycode 筛选</span></div>
				<div class="tool-fields">
					<el-input v-model="filters.name" class="w-lg" placeholder="按名称搜索" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<el-input v-model="filters.adcode" class="w-sm" placeholder="按 adcode 搜索" clearable
						@keyup.enter="onSearch" @clear="onSearch" />
					<el-input v-model="filters.citycode" class="w-sm" placeholder="按 citycode 搜索" clearable
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
						<div class="empty-sub">调整名称、adcode 或 citycode 条件后重试</div>
					</div>
				</template>
				<el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip>
					<template #default="{ row }">
						<span class="line-name">{{ row.name }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="adcode" label="adcode" width="120">
					<template #default="{ row }">
						<span class="code">{{ row.adcode }}</span>
					</template>
				</el-table-column>
				<el-table-column label="citycode" width="110">
					<template #default="{ row }">
						<span class="code">{{ row.citycode ?? '-' }}</span>
					</template>
				</el-table-column>
				<el-table-column prop="created_at" label="创建时间" min-width="170" />
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
	</div>
</template>

<script setup lang="ts">

const list = ref<any[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const filters = ref({ name: '', adcode: '', citycode: '' })

async function loadList() {
	loading.value = true
	try {
		const res = await request('/api/citycodes', {
			query: {
				name: filters.value.name || undefined,
				adcode: filters.value.adcode || undefined,
				citycode: filters.value.citycode || undefined,
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

function onSearch() {
	page.value = 1 // 搜索时回到第一页
	loadList()
}

function resetSearch() {
	filters.value = { name: '', adcode: '', citycode: '' }
	page.value = 1
	loadList()
}

onMounted(loadList)
</script>
