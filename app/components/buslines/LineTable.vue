<template>
	<!-- 线路表 + 行内操作（编辑 / 删除）。点行 -> 向外 emit，由页面决定打开详情 -->
	<div>
		<el-table v-loading="loading" :data="list" :row-class-name="rowClass" @row-click="onRowClick">
			<template #empty>
				<div class="empty">
					<div class="empty-icon"></div>
					<template v-if="selectedArea">
						<div class="empty-title">{{ selectedArea.name }} 下没有线路</div>
						<div class="empty-sub">
							该区域（及其下级区县）还没有映射数据 —— 先确认边界已爬，再到上方「区域映射」点「开始映射」
						</div>
					</template>
					<template v-else>
						<div class="empty-title">没有找到线路</div>
						<div class="empty-sub">到上方「拉取入库」拉一批线路，或从左侧选一个行政区</div>
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

			<el-table-column prop="name" label="线路名" min-width="150" show-overflow-tooltip>
				<template #default="{ row }">
					<span class="line-name">{{ row.name }}</span>
				</template>
			</el-table-column>
			<el-table-column prop="type" label="类型" width="80" class-name="col-center" label-class-name="col-center" />
			<el-table-column prop="start_stop" label="首发站" min-width="110" show-overflow-tooltip />
			<el-table-column prop="end_stop" label="末站" min-width="110" show-overflow-tooltip />
			<el-table-column label="首末班" width="130" class-name="col-center" label-class-name="col-center">
				<template #default="{ row }">{{ timeRange(row) }}</template>
			</el-table-column>
			<el-table-column prop="basic_price" label="起步价" width="80" class-name="col-num" label-class-name="col-num" />
			<el-table-column label="状态" width="80" class-name="col-center" label-class-name="col-center">
				<template #default="{ row }">
					<span class="status" :class="`status-${row.status}`">{{ statusText(row.status) }}</span>
				</template>
			</el-table-column>

			<!-- 选中区域后才有：这条线在该区域内是什么角色、覆盖了多少 -->
			<el-table-column v-if="selectedArea" label="区域内" width="200" class-name="col-center"
				label-class-name="col-center">
				<template #default="{ row }">
					<span class="role" :class="`role-${roleKey(row)}`">{{ roleText(row) }}</span>
					<span class="cover">{{ row.areaCount }} 区 · {{ row.stopNum }} 站</span>
				</template>
			</el-table-column>

			<!-- 行内操作：加宽到容下两个按钮不折行；固定右侧，横向滚动时始终可见 -->
			<el-table-column label="操作" width="140" fixed="right" class-name="col-center"
				label-class-name="col-center">
				<template #default="{ row }">
					<el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
					<el-button size="small" type="danger" plain @click.stop="removeLine(row)">删除</el-button>
				</template>
			</el-table-column>
		</el-table>

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
import { ref } from 'vue'
import { colorOf, formatTimeDesc, roleKey, roleText, statusText, timeRange } from '~/utils/busline'

const props = defineProps<{
	list: any[]
	loading: boolean
	selectedArea: any
	activeId?: string   // 当前在详情抽屉里打开的线路，对应行高亮
}>()

const emit = defineEmits<{
	'row-click': [row: any]
	changed: []            // 数据被改动（编辑 / 删除），页面该刷新列表
	removed: [id: string]  // 某条线路被删，页面据此关掉它的详情
}>()

function rowClass({ row }: { row: any }) {
	return props.activeId && row.id === props.activeId ? 'is-active' : ''
}

// 点展开箭头时只展开字段面板，不打开详情
function onRowClick(row: any, _column: any, event: MouseEvent) {
	if ((event?.target as HTMLElement)?.closest?.('.el-table__expand-icon')) return
	emit('row-click', row)
}

// ---- 编辑 ----
const editDialog = ref(false)
const editForm = ref<any>({})

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
	emit('changed')
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
	if (res && res.code == 200) {
		ElMessage.success('删除成功')
	} else {
		ElMessage.error('删除失败')
	}
	emit('removed', data.id)
	emit('changed')
}
</script>
