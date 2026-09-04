<template>
	<div style="padding: 20px">
		<h2>手动标记是否完成</h2>

		<!-- 查询条件 -->
		<div style="margin-bottom: 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
			<!-- <el-input v-model="filters.name" style="width: 180px" placeholder="按名称搜索" clearable
				@keyup.enter="onSearch" @clear="onSearch" /> -->
			<!-- <el-input v-model="filters.adcode" style="width: 150px" placeholder="按 adcode 搜索" clearable
				@keyup.enter="onSearch" @clear="onSearch" /> -->
			<el-input v-model="filters.citycode" style="width: 150px" placeholder="按 citycode 搜索" clearable
				@keyup.enter="onSearch" @clear="onSearch" />
			<el-button type="primary" @click="onSearch">查询</el-button>
			<el-button @click="resetSearch">重置</el-button>
			<el-button @click="loadList">刷新列表</el-button>
		</div>

		<!-- 列表 -->
		<el-table v-loading="loading" :data="list" style="margin-top: 16px">
			<el-table-column label="citycode" width="110">
				<template #default="{ row }">
					{{ row.citycode ?? '-' }}
				</template>
			</el-table-column>
			<el-table-column prop="doneNum" label="已执行数量" show-overflow-tooltip />
			<el-table-column prop="status" label="状态" width="180" />
			<el-table-column prop="updatedAt" label="更新时间" width="180" />

			
			<el-table-column label="操作" width="150" fixed="right">
				<template #default="{ row }">
					<el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
				</template>
			</el-table-column>
		</el-table>

		
		<!-- 编辑弹窗 -->
		<el-dialog v-model="editDialog" title="编辑线路" width="600px">
			<el-form :model="editForm" label-width="90px">
				<el-form-item label="当前index"><el-input v-model="editForm.doneNum" /></el-form-item>
				<el-form-item label="状态">
					<el-select v-model="editForm.status" placeholder="完成状态">
						<el-option :value="0" label="未完成" />
						<el-option :value="1" label="已完成" />
					</el-select>
				</el-form-item>
			</el-form>
			<template #footer>
				<el-button @click="editDialog = false">取消</el-button>
				<el-button type="primary" @click="submitEdit">保存</el-button>
			</template>
		</el-dialog>

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

// ---- 编辑弹窗 ----
const editDialog = ref(false)
const editForm = ref<any>({})

const filters = ref({ name: '', adcode: '', citycode: '' })

async function loadList() {
	loading.value = true
	try {
		const res = await request('/api/citycodes/doneStatus', {
			query: {
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
