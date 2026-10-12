<template>
	<div class="dashboard">
		<!-- ── 欢迎条 ── -->
		<section class="welcome-band">
			<div class="welcome-left">
				<div class="welcome-time">{{ period }}</div>
				<h2 class="welcome-title">{{ greetText }}，欢迎回来</h2>
				<p class="welcome-sub">
					今天是 {{ today }}，本地库已收录 {{ total }} 条公交线路，覆盖 {{ adcodeCount }} 个区县
				</p>
			</div>
			<div class="welcome-right">
				<div class="quick-stat">
					<div class="qs-num">{{ total }}</div>
					<div class="qs-lbl">公交线路</div>
				</div>
				<div class="quick-stat">
					<div class="qs-num">{{ adcodeCount }}</div>
					<div class="qs-lbl">覆盖区县</div>
				</div>
				<div class="quick-stat">
					<div class="qs-num">{{ cityTotal }}</div>
					<div class="qs-lbl">城市编码</div>
				</div>
			</div>
		</section>

		<!-- ── 功能模块 ── -->
		<div class="sec-header">
			<div class="sec-eyebrow">MODULES</div>
			<h3 class="sec-title">功能模块</h3>
		</div>

		<div class="module-grid">
			<div class="module-card" @click="go('/buslines')">
				<div class="module-icon-wrap">
					<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
						stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M8 6v6" />
						<path d="M15 6v6" />
						<path d="M2 12h19.6" />
						<path
							d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
						<circle cx="7" cy="18" r="2" />
						<path d="M9 18h5" />
						<circle cx="16" cy="18" r="2" />
					</svg>
				</div>
				<div class="module-name">公交线路本地库</div>
				<div class="module-desc">检索与维护本地库中的线路明细，支持关键词拉取入库、循环抓取与逐站查看。</div>
				<div class="module-footer">
					<span class="module-tag tag-sky">数据</span>
					<svg class="module-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none"
						stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M5 12h14" />
						<path d="m12 5 7 7-7 7" />
					</svg>
				</div>
			</div>

			<div class="module-card" @click="go('/busmap')">
				<div class="module-icon-wrap">
					<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
						stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path
							d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 01-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0112 0" />
						<path
							d="M4.474 15h-.197a1 1 0 00-.969.753l-1.097 4.35a1.5 1.5 0 001.444 1.898L20.344 22a1.5 1.5 0 001.446-1.897l-1.098-4.35a1 1 0 00-.969-.753h-.197" />
						<circle cx="12" cy="8" r="2" />
					</svg>
				</div>
				<div class="module-name">公交地图</div>
				<div class="module-desc">在地图上按关键词检索线路与站点，直观查看走向、换乘节点与实时定位。</div>
				<div class="module-footer">
					<span class="module-tag tag-sage">地图</span>
					<svg class="module-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none"
						stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M5 12h14" />
						<path d="m12 5 7 7-7 7" />
					</svg>
				</div>
			</div>

			<div class="module-card" @click="go('/districts')">
				<div class="module-icon-wrap">
					<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
						stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<ellipse cx="12" cy="5" rx="9" ry="3" />
						<path d="M3 5V19A9 3 0 0 0 21 19V5" />
						<path d="M3 12A9 3 0 0 0 21 12" />
					</svg>
				</div>
				<div class="module-name">行政区边界管理</div>
				<div class="module-desc">维护行政区层级与边界：adcode、父级归属、边界坐标，支持逐级展开与粘贴导入。</div>
				<div class="module-footer">
					<span class="module-tag tag-warm">基础</span>
					<svg class="module-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none"
						stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M5 12h14" />
						<path d="m12 5 7 7-7 7" />
					</svg>
				</div>
			</div>

			<div class="module-card" @click="go('/markdone')">
				<div class="module-icon-wrap">
					<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
						stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M13 5h8" />
						<path d="M13 12h8" />
						<path d="M13 19h8" />
						<path d="m3 17 2 2 4-4" />
						<path d="m3 7 2 2 4-4" />
					</svg>
				</div>
				<div class="module-name">城市拉取标记</div>
				<div class="module-desc">记录每个城市已拉取到的 keyword 断点与完成状态，支持中断后继续。</div>
				<div class="module-footer">
					<span class="module-tag tag-rose">进度</span>
					<svg class="module-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none"
						stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
						<path d="M5 12h14" />
						<path d="m12 5 7 7-7 7" />
					</svg>
				</div>
			</div>
		</div>

		<!-- ── 底部双面板 ── -->
		<div class="bottom-grid">
			<section class="panel">
				<div class="panel-head">
					<div>
						<div class="panel-lbl">PULLING</div>
						<div class="panel-title">拉取进度</div>
					</div>
					<div class="panel-more" @click="go('/markdone')">全部 →</div>
				</div>
				<div class="panel-body">
					<template v-if="runningTasks.length">
						<div v-for="t in runningTasks" :key="t.citycode" class="task-item">
							<div class="task-top">
								<span class="task-city">{{ t.citycode }}</span>
								<span class="task-num">{{ t.doneNum }} / {{ t.totalNum }}</span>
							</div>
							<div class="prog-bar">
								<div class="prog-fill" :style="{ width: progressOf(t) + '%' }" />
							</div>
							<div class="task-time">{{ shortTime(t.updatedAt) }}</div>
						</div>
					</template>
					<div v-else class="mini-empty">当前没有进行中的拉取任务</div>
				</div>
			</section>

			<section class="panel">
				<div class="panel-head">
					<div>
						<div class="panel-lbl">RECENT</div>
						<div class="panel-title">最近入库</div>
					</div>
					<div class="panel-more" @click="go('/buslines')">全部 →</div>
				</div>
				<div class="panel-body">
					<div v-for="l in recentLines" :key="l.id" class="recent-row" @click="go('/buslines')">
						<span class="recent-swatch" :style="{ background: colorOf(l.uicolor) }" />
						<div class="recent-info">
							<div class="recent-name">{{ l.name }}</div>
							<div class="recent-meta">{{ l.company || '未标注公司' }} · {{ l.citycode || '-' }}</div>
						</div>
						<div class="recent-time">{{ shortTime(l.created_at) }}</div>
					</div>
					<div v-if="!recentLines.length" class="mini-empty">暂无数据</div>
				</div>
			</section>
		</div>
	</div>
</template>

<script setup lang="ts">
const total = ref(0)
const adcodeCount = ref(0)
const cityTotal = ref(0)
const runningTasks = ref<any[]>([])
const recentLines = ref<any[]>([])
const period = ref('')
const greetText = ref('你好')
const today = ref('')

// 时间问候（放 onMounted 里算，避免服务端/客户端时间不一致导致的注水不匹配）
function initGreeting() {
	const now = new Date()
	const h = now.getHours()
	if (h < 6) { period.value = 'LATE NIGHT'; greetText.value = '夜深了' }
	else if (h < 12) { period.value = 'GOOD MORNING'; greetText.value = '早上好' }
	else if (h < 18) { period.value = 'GOOD AFTERNOON'; greetText.value = '下午好' }
	else { period.value = 'GOOD EVENING'; greetText.value = '晚上好' }
	today.value = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`
}

async function loadDashboard() {
	const [numRes, cityRes, taskRes, lineRes] = await Promise.all([
		request('/api/buslines/getIndexNum'),
		request('/api/citycodes', { query: { page: 1, pageSize: 1 } }),
		request('/api/citycodes/doneStatus', { query: { status: 1, page: 1, pageSize: 5 } }),
		request('/api/buslines', { query: { page: 1, pageSize: 50 } })
	])

	if (numRes?.code === 200) {
		total.value = numRes.data?.total ?? 0
		adcodeCount.value = numRes.data?.adcodeCount ?? 0
	}
	if (cityRes?.code === 200) cityTotal.value = cityRes.total ?? 0
	if (taskRes?.code === 200) runningTasks.value = taskRes.data ?? []

	// 线路接口按 name 排序，这里取一页后在本地按入库时间倒序，拿最近入库的几条
	const rows: any[] = Array.isArray(lineRes?.data) ? [...lineRes.data] : []
	rows.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
	recentLines.value = rows.slice(0, 5)
}

// 拉取进度：doneNum / totalNum（都是 keyword 序号），totalNum 缺失时不画进度条
function progressOf(t: any): number {
	const done = Number(t?.doneNum) || 0
	const all = Number(t?.totalNum) || 0
	if (all <= 0) return 0
	return Math.min(100, Math.max(0, Math.round((done / all) * 100)))
}

// 时间戳只保留到分钟，避免在窄列里占位过宽
function shortTime(s: any): string {
	const t = String(s ?? '').trim()
	return t ? t.slice(0, 16) : '-'
}

// UI色：兼容 "ff0000" / "#ff0000"，空值返回空串让 CSS 走默认色
function colorOf(c: any): string {
	const s = String(c ?? '').trim()
	if (!s) return ''
	return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : s
}

function go(path: string) {
	navigateTo(path)
}

onMounted(() => {
	initGreeting()
	loadDashboard()
})
</script>
