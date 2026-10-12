<template>
	<!-- 区域映射：重建「线路 ↔ 区域」映射。纯本地计算，不消耗配额，每天爬完新线路点一次 -->
	<div class="task-pane">
		<div class="tool-fields">
			<el-button type="warning" :disabled="mapRunning" @click="startMapping">开始映射</el-button>
			<el-button v-if="mapRunning" type="danger" plain @click="mapStopped = true">停止</el-button>
		</div>

		<p class="task-hint">
			按站点判断每条线路落在哪些区县，结果写入映射表。纯本地计算、不消耗高德配额，
			每天爬完新线路后点一次即可，可随时停止；下次重跑会自动从头清表重建。
		</p>

		<TaskProgress v-if="mapRunning || mapStats.total > 0" title="映射进度" :sub="mapSub" :tag="`${mapPercent}%`"
			:running="mapRunning" :percent="mapPercent" :stats="mapStatList" :log="mapLog" />
	</div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import TaskProgress from './TaskProgress.vue'

const emit = defineEmits<{
	running: [value: boolean]
	changed: []   // 映射结果变了，页面该刷新列表（选中区域时尤其明显）
}>()

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

const mapSub = computed(() =>
	`${mapRunning.value ? `正在处理第 ${mapDone.value + 1} 个区县` : '已结束'}` +
	` · 已处理 ${mapDone.value} / ${mapStats.value.total} 个区县 · 每批 ${MAP_BATCH} 个`
)

const mapStatList = computed(() => [
	{ label: '已处理区县', value: mapDone.value },
	{ label: '站点归属行', value: mapStats.value.stopAreas, tone: 'ok' as const },
	{ label: '线路映射行', value: mapStats.value.lineAreas, tone: 'ok' as const },
	{ label: '未覆盖线路', value: mapStats.value.linesUnmapped, tone: 'bad' as const }
])

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

	emit('changed')
}

watch(mapRunning, (v) => emit('running', v))

// 离开页面时停掉后续批次（已处理的部分有效，下次重跑会清表重建）
onUnmounted(() => {
	mapStopped.value = true
})
</script>
