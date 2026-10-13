<template>
	<!-- 拉取入库：从高德按关键词拉线路并保存。单个关键词 / keyword 区间循环两种模式 -->
	<div class="task-pane">
		<div class="tool-fields">
			<el-radio-group v-model="mode" :disabled="busy">
				<el-radio-button value="single">单个关键词</el-radio-button>
				<el-radio-button value="range">区间循环</el-radio-button>
			</el-radio-group>

			<el-input v-model="cityModel" class="w-sm" placeholder="citycode" />

			<template v-if="mode === 'single'">
				<el-input v-model="keyword" class="w-sm" placeholder="线路关键词" @keyup.enter="onFetch" />
				<el-button type="primary" :loading="pulling" @click="onFetch">拉取并入库</el-button>
			</template>

			<template v-else>
				<el-input v-model="loopStart" class="w-xs" placeholder="起始keyword" />
				<span class="range-sep">~</span>
				<el-input v-model="loopEnd" class="w-xs" placeholder="截止keyword" />
				<el-button type="warning" :disabled="loopRunning" @click="startLoopTask">开始拉取</el-button>
				<el-button v-if="loopRunning" type="danger" plain @click="onStopClick">停止</el-button>
			</template>
		</div>

		<p class="task-hint">
			{{ mode === 'single'
				? '按关键词获取线路并保存。'
				: '按 keyword 区间依次拉取并入库，会持续消耗接口配额，可随时停止。' }}
		</p>

		<TaskProgress v-if="mode === 'range' && (loopRunning || loopStats.total > 0)" title="循环拉取进度"
			:sub="`city=${props.city}，keyword ${loopStart}~${loopEnd}`"
			:tag="loopRunning ? `执行中 keyword=${loopCurrent}` : '已结束'" :running="loopRunning"
			:percent="loopPercent" :stats="loopStatList" :log="loopLog" />
	</div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import TaskProgress from '~/components/buslines/TaskProgress.vue'

const props = defineProps<{ city: string }>()
const emit = defineEmits<{
	'update:city': [value: string]
	running: [value: boolean]   // 有拉取任务在跑（供页面给标签页打小圆点）
	changed: []                 // 入库数据变了，页面该刷新列表
}>()

const cityModel = computed({
	get: () => props.city,
	set: (v: string) => emit('update:city', v)
})

const LOOP_INTERVAL = 2000  // 每 2 秒一次，翻页之间也要间隔，否则容易触发高德限额
function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

const mode = ref<'single' | 'range'>('single')

// ---- 单个关键词 ----
const keyword = ref('1')
const pulling = ref(false)

async function fetchAndSave(keywords: string, page: number = 1) {
	const res: any = await request('/api/mapApi/getBusmapList', {
		method: 'POST',
		body: { city: props.city, keywords, page },
	})
	const lines = Array.isArray(res) ? res : res.buslines ?? []
	if (!lines.length) {
		return { count: 0, skipped: 0 }
	}
	const saveRes = await request(
		'/api/buslines/save',
		{ method: 'POST', body: lines }
	)
	const { count, skipped } = saveRes.data
	if (skipped > 0) {
		ElMessage.info(`本次返回 ${lines.length} 条，实际入库 ${count} 条，跳过已有 ${skipped} 条`)
	} else {
		ElMessage.success(`已入库 ${count} 条线路`)
	}
	// 用 count 除以 50 向上取整得到总页数，还有下一页就继续拉
	if (page + 1 <= Math.ceil(res.count / 50)) {
		await sleep(LOOP_INTERVAL)
		return fetchAndSave(keywords, page + 1)
	}
	emit('changed')
	return { count, skipped }
}

async function onFetch() {
	if (pulling.value) return
	pulling.value = true
	try {
		await fetchAndSave(keyword.value)
	} finally {
		pulling.value = false
	}
}

// ---- 区间循环 ----
const loopStart = ref('801')  // keyword 起始
const loopEnd = ref('999')    // keyword 截止

const loopRunning = ref(false)
const loopCurrent = ref(0)      // 当前 keyword
const loopStats = ref({ total: 0, inserted: 0, skipped: 0, failed: 0, sumFailed: 0 })
const loopLog = ref<string[]>([])
const loopTotalRange = ref(999)   // 总范围（用于进度条百分比）
const loopBegin = ref(0)          // 本次任务起始 keyword（用于进度条百分比）
const loopPercent = computed(() => {
	if (!loopCurrent.value || loopTotalRange.value <= 0) return 0
	return Math.min(100, Math.max(0, Math.round(((loopCurrent.value - loopBegin.value + 1) / loopTotalRange.value) * 100)))
})

const loopStatList = computed(() => [
	{ label: '总请求', value: loopStats.value.total },
	{ label: '已入库', value: loopStats.value.inserted, tone: 'ok' as const },
	{ label: '跳过已有', value: loopStats.value.skipped, tone: 'warn' as const },
	{ label: '失败', value: loopStats.value.failed, tone: 'bad' as const }
])

const stopClick = ref(false)

function pushLog(msg: string) {
	const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
	loopLog.value.push(`[${time}] ${msg}`)
	if (loopLog.value.length > 200) loopLog.value.shift()
}

// 所有的停止动作入库，停止后重新查询
async function startLoopTask() {
	if (loopRunning.value) return
	const start = Number(loopStart.value) || 1
	const end = Number(loopEnd.value) || 999
	const rangeCount = Math.max(0, end - start + 1)
	if (rangeCount <= 0) {
		ElMessage.warning('起始 keyword 不能大于截止 keyword')
		return
	}

	loopRunning.value = true
	loopStats.value = { total: 0, inserted: 0, skipped: 0, failed: 0, sumFailed: 0 }
	loopLog.value = []
	loopCurrent.value = 0
	loopTotalRange.value = rangeCount
	loopBegin.value = start

	const runOne = async (k: number, page: number = 1) => {
		loopCurrent.value = k
		loopStats.value.total++
		try {
			const res: any = await request('/api/mapApi/getBusmapList', {
				method: 'POST',
				body: { city: props.city, keywords: String(k), page } // city 取输入框值
			})
			if (res.status == '0' && res.infocode != '10000') {
				pushLog(`到限额了捏，下次从${k}开始`)
				// 保存当前 k 到数据库对应的city字段，在下次循环的时候会入库
				loopStart.value = String(k)
				stopClick.value = false   // 内部停优先，别再让 for 头覆盖
				stopLoopTask()
				return
			}
			if (res.code == '500') {
				loopStats.value.sumFailed++
				if (loopStats.value.sumFailed >= 10) {
					pushLog(`第${loopStats.value.sumFailed}次报错了捏${res.msg}，停止`)
					loopStart.value = String(k)
					stopClick.value = false   // 内部停优先，别再让 for 头覆盖
					stopLoopTask()
					return
				}
				pushLog(`报错了捏${res.msg}，5 秒后重试 keyword=${k}`)
				// 随时点按钮终止
				if (!loopRunning.value) return
				await sleep(5000)
				if (!loopRunning.value) return
				return runOne(k, page)
			}
			loopStats.value.sumFailed = 0
			const lines = Array.isArray(res) ? res : res.buslines ?? []
			if (!lines.length) {
				pushLog(`keyword=${k} 无数据`)
				return
			}
			const saveRes = await request(
				'/api/buslines/save',
				{ method: 'POST', body: lines }
			)
			const { count, skipped } = saveRes.data
			loopStats.value.inserted += count
			loopStats.value.skipped += skipped
			pushLog(`keyword=${k} 返回${lines.length}条，入库${count}，跳过${skipped}`)
			// 用 res.count 除以 50 向上取整得到总页数，还有下一页就继续拉
			if (page + 1 <= Math.ceil(res.count / 50)) {
				if (!loopRunning.value) return
				await sleep(LOOP_INTERVAL)   // 翻页之间也要间隔，否则容易触发高德限额
				if (!loopRunning.value) return
				return runOne(k, page + 1)
			}

		} catch (e: any) {
			loopStats.value.failed++
			loopStats.value.sumFailed = 0
			pushLog(`keyword=${k} 失败：${e?.message ?? e}`)
		}
	}

	pushLog(`循环任务开始：city=${props.city}，keyword ${start}~${end}，间隔 ${LOOP_INTERVAL / 1000}s`)
	for (let k = start; k <= end; k++) {
		if (!loopRunning.value) {
			// 最后还没跑的index赋给start，同时存库里，意味着下次从该index直接开始
			if (stopClick.value) {
				loopStart.value = String(k)
				stopClick.value = false
			}
			break
		}
		await runOne(k)
		if (k < end && loopRunning.value) {
			await sleep(LOOP_INTERVAL)
		}
	}

	if (loopRunning.value) {
		loopStart.value = String(loopEnd.value)
		pushLog('循环任务全部完成')
	} else {
		pushLog('循环任务已停止')
	}
	loopRunning.value = false
	// 保存当前 k 到数据库对应的city字段
	await request('/api/citycodes/saveDoneNum', {
		method: 'POST',
		body: { citycode: props.city, doneNum: loopStart.value, status: loopStart.value == loopEnd.value ? 2 : 1 }
	})
	emit('changed')
}

function stopLoopTask() {
	loopRunning.value = false
}

function onStopClick() {
	stopLoopTask()
	stopClick.value = true
}

// ---- 断点续拉：进页面时读取上次停在哪个 keyword，顺便带出 citycode ----
async function loadNum(citycode = '') {
	const res = await request('/api/citycodes/doneStatus', {
		query: { citycode, status: 1, page: 1, pageSize: 20 }
	})
	if (res && res.code == 200 && res.data && res.data.length) {
		loopStart.value = res.data[0].doneNum
		emit('update:city', res.data[0].citycode)
	}
}

// ---- 对外：运行状态 + 页面需要先拿到 citycode 再加载列表 ----
const busy = computed(() => pulling.value || loopRunning.value)
watch(busy, (v) => emit('running', v))

defineExpose({ loadNum })

// 页面卸载 / 路由离开时先终止循环轮询，避免请求还在后台继续跑
function stopLoopOnLeave() {
	if (!loopRunning.value) return
	stopClick.value = true // 交给 for 头把当前 k 记为断点
	stopLoopTask()
}

onUnmounted(stopLoopOnLeave)

onBeforeRouteLeave(() => {
	stopLoopOnLeave()
})
</script>
