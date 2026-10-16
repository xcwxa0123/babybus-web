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
			<path :d="hemFill" fill="url(#hem-grad)" />
			<path :d="hemLine" fill="none" stroke="rgba(255, 240, 210, 0.30)" stroke-width="1" />
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
// 一维 fbm：hash/noise 与幕布 shader 同一套公式（CPU 版）
function h1(n: number) {
	const s = Math.sin(n * 127.1) * 43758.5453123
	return s - Math.floor(s)
}
function noise1(x: number, seed: number) {
	const i = Math.floor(x)
	const f = x - i
	const u = f * f * (3 - 2 * f)
	return h1(i + seed) * (1 - u) + h1(i + 1 + seed) * u
}

// 撕布边：低频大起伏 + 高频小抖 + 微锯齿，三层叠加后钳进 [6, 42]。
// 活布缘：噪声相位随 hemTick 缓慢漂移（每 450ms 换一档）——布缘真的在飘，
// 而不是一条焊死的装饰线。离散换相位而不是连续时间：重算便宜、视觉够缓。
const hemTick = ref(0)
let hemTimer: ReturnType<typeof setInterval> | null = null

function hemY(t: number) {
	const s = hemTick.value * 0.37
	let y = 24
		+ (noise1(t * 7.3, 3.1 + s) - 0.5) * 20
		+ (noise1(t * 23.0, 7.7 + s) - 0.5) * 9
		+ (noise1(t * 61.0, 11.3 + s) - 0.5) * 3.5
	return Math.max(6, Math.min(42, y))
}

onMounted(() => {
	// 尊重减弱动效：布缘保持静止
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
	hemTimer = setInterval(() => { hemTick.value++ }, 450)
})

onBeforeUnmount(() => {
	if (hemTimer) clearInterval(hemTimer)
	hemTimer = null
})

const HEM_N = 96
const HEM_W = 1440
const HEM_H = 48

function hemPoints() {
	const pts: string[] = []
	for (let i = 0; i <= HEM_N; i++) {
		const x = ((i / HEM_N) * HEM_W).toFixed(1)
		const y = hemY(i / HEM_N).toFixed(1)
		pts.push((i === 0 ? 'M' : 'L') + x + ',' + y)
	}
	return pts.join(' ') + ' '
}

// 布色填充到顶部闭合：深半档的幕布色从上垂到撕边线——"幕布的下缘"
const hemFill = computed(() => hemPoints() + `L${HEM_W},0 L0,0 Z`)
const hemLine = computed(() => hemPoints())
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
