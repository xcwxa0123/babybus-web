<template>
	<!-- 幕布的余韵：页脚上方垂下来的撕布边。
	     内容页的世界观是"登录后穿过幕布、站在纸面上工作"——这条布边就是
	     两个世界之间那条缝。形状由一维 fbm 噪声采样生成（和幕布 shader 的
	     hash/noise 同一套公式，CPU 版），seed 写死 ⇒ 每次渲染长同一个样子。 -->
	<div class="foot-hem" aria-hidden="true">
		<svg class="hem-svg" viewBox="0 0 1440 48" preserveAspectRatio="none">
			<defs>
				<!-- 深色舞台上的撕布边 = "被脚灯照亮的下缘"：顶部融入深底，
				     越靠撕边越亮（脚灯从下往上打光），亮布色 + 亮描边 -->
				<linearGradient id="hem-grad" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="rgba(243, 237, 226, 0)" />
					<stop offset="0.55" stop-color="rgba(243, 237, 226, 0.14)" />
					<stop offset="1" stop-color="rgba(243, 237, 226, 0.30)" />
				</linearGradient>
			</defs>
			<path ref="hemFillEl" d="" fill="url(#hem-grad)" />
			<path ref="hemLineEl" d="" fill="none" stroke="rgba(255, 240, 210, 0.30)" stroke-width="1" />
		</svg>
		<!-- <span class="hem-note">从这条布边底下穿过来</span> -->
	</div>

	<footer>
		<div class="footer-inner">
			<div class="footer-logo">多 喝 温 水</div>
			<div class="footer-sub">© 2026 多喝温水 · 仅供个人使用，版权归原作者所有</div>
		</div>
	</footer>
</template>

<script setup lang="ts">
// 撕布边波形：解析波形叠加（四层 sin：缓风 + 宽波 + 细波 + 微波，各带自己的
// 时间速度）。时间直接进 sin 参数 ⇒ 数学上连续，永不跳变——
// 之前两版"活布缘"都用噪声查表 + seed/相位漂移，h1 的 sin/fract 对 seed 混沌敏感，
// 漂移等于每帧重掷骰子，怎么调都是高速抖动。解析波形是唯一正解。
function hemY(x01: number, t: number) {
	const x = (x01 - 0.5) * 2          // [-1, 1]，频率按全宽布缘归一
	const tt = t * 0.55                // 布缘比"风中的光线"更缓
	const slowWind = Math.sin(x * 3.4 - tt * 0.34)
	const broadWave = Math.sin(x * 7.2 - tt * 0.52 + 0.35 * Math.sin(x * 1.7 + tt * 0.16))
	const fineWave = Math.sin(x * 16.0 - tt * 0.78 + 0.55 * Math.sin(x * 4.0 - tt * 0.23))
	const tinyWave = Math.sin(x * 27.0 - tt * 0.93 + Math.sin(x * 6.0 + tt * 0.18))
	const y = 24
		+ slowWind * 7.4
		+ broadWave * 3.9
		+ fineWave * 1.2
		+ tinyWave * 0.4
	return Math.max(6, Math.min(42, y))
}

const HEM_N = 96
const HEM_W = 1440
const HEM_H = 48

function hemPoints(t: number) {
	const pts: string[] = []
	for (let i = 0; i <= HEM_N; i++) {
		const x = ((i / HEM_N) * HEM_W).toFixed(1)
		const y = hemY(i / HEM_N, t).toFixed(1)
		pts.push((i === 0 ? 'M' : 'L') + x + ',' + y)
	}
	return pts.join(' ') + ' '
}

// rAF 每帧重算 path 并直写 DOM（96 点 × 4 层 sin，成本可忽略，绕过响应式）。
// reduced-motion：只画一帧静态。
const hemFillEl = ref<SVGPathElement | null>(null)
const hemLineEl = ref<SVGPathElement | null>(null)
let hemRaf = 0
let hemLast = 0
let hemT = 0

function applyHem(t: number) {
	const d = hemPoints(t)
	if (hemFillEl.value) hemFillEl.value.setAttribute('d', d + `L${HEM_W},0 L0,0 Z`)
	if (hemLineEl.value) hemLineEl.value.setAttribute('d', d)
}

function hemLoop(now: number) {
	const dt = hemLast ? Math.min(0.05, (now - hemLast) / 1000) : 0
	hemLast = now
	hemT += dt
	applyHem(hemT)
	hemRaf = requestAnimationFrame(hemLoop)
}

onMounted(() => {
	applyHem(0)   // 首帧立即绘制，避免 path 空白一闪
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
	hemRaf = requestAnimationFrame(hemLoop)
})

onBeforeUnmount(() => {
	cancelAnimationFrame(hemRaf)
	hemRaf = 0
})
</script>

<style scoped>
.foot-hem {
	position: relative;
	height: 48px;
	margin-top: 64px;
	overflow: hidden;
}

.hem-svg {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.hem-note {
	position: absolute;
	right: 56px;
	bottom: 3px;
	font-size: 9px;
	letter-spacing: 3px;
	color: var(--on-stage-mid);
	text-shadow: 0 1px 6px rgba(20, 14, 6, 0.7);
}
</style>
