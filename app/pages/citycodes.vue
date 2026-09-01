<template>
	<div style="padding: 20px">
		<h2>城市编码本地库（adcode / citycode）</h2>

		<!-- 查询条件 -->
		<div style="margin-bottom: 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
			<el-input v-model="filters.name" style="width: 180px" placeholder="按名称搜索" clearable
				@keyup.enter="onSearch" @clear="onSearch" />
			<el-input v-model="filters.adcode" style="width: 150px" placeholder="按 adcode 搜索" clearable
				@keyup.enter="onSearch" @clear="onSearch" />
			<el-input v-model="filters.citycode" style="width: 150px" placeholder="按 citycode 搜索" clearable
				@keyup.enter="onSearch" @clear="onSearch" />
			<el-button type="primary" @click="onSearch">查询</el-button>
			<el-button @click="resetSearch">重置</el-button>
			<el-button @click="loadList">刷新列表</el-button>
		</div>

		<!-- 列表 -->
		<el-table v-loading="loading" :data="list" style="margin-top: 16px">
			<!-- <el-table-column prop="id" label="ID" width="80" /> -->
			<el-table-column prop="name" label="名称" show-overflow-tooltip />
			<el-table-column prop="adcode" label="adcode" width="120" />
			<el-table-column label="citycode" width="110">
				<template #default="{ row }">
					{{ row.citycode ?? '-' }}
				</template>
			</el-table-column>
			<el-table-column prop="created_at" label="创建时间" width="180" />
		</el-table>

		<!-- 分页 -->
		<div style="display: flex; justify-content: flex-end; margin-top: 12px">
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
