<template>
	<!-- 全局跳转 Loading（常驻 app.vue，不随路由销毁）。
	     两层接力：CSS 预盖层从 SSR 起就盖着——WebGL 没就绪时是它兜底，
	     就绪后幕布 canvas 画"全遮帧"接管视觉；接口查完（见 useCurtainGate）
	     撤掉预盖层、放开 paused，幕布从左/右拉开。
	     动画参数全部用 InkCurtain 的默认值，唯一改的是 autoPlay=false：
	     常驻组件不能一挂载就自己播，播不播、何时播都听 covering 的。 -->
	<div v-if="covering" class="curtain-veil" aria-hidden="true"></div>
	<InkCurtain ref="curtainRef" :auto-play="false" :paused="covering" />
</template>

<script setup lang="ts">
const curtainRef = ref<any>(null)
const gate = useCurtainGate()
const covering = gate.covering
const dir = gate.dir

onMounted(() => {
	const nuxtApp = useNuxtApp()
	// 页面挂载完成之后才允许结算"空档"（时序解释见 useCurtainGate.pageSettled）
	nuxtApp.hook('page:finish', () => gate.pageSettled())
	// 首屏从 SSR 带着盖幕状态进来：让 WebGL 幕布接管 CSS 预盖层。
	// 此刻 :paused 已是 true，play 完的第一帧就定格在全遮，不会漏开。
	if (covering.value) curtainRef.value?.play?.(dir.value)
})

// 客户端路由切换：盖幕时重新 play（进度归零、按新方向重排布边与粒子）。
// flush:'post' 很关键——要等 :paused 同步成 true 再 play，否则 play 后的
// 头几帧会在 paused 生效前多推进几毫秒，幕布先裂开一条细缝。
watch(covering, (v) => {
	if (v) curtainRef.value?.play?.(dir.value)
}, { flush: 'post' })
</script>

<style scoped>
.curtain-veil {
	position: fixed;
	inset: 0;
	/* 让位给幕布 canvas（4000）：视觉由幕布负责，这层负责"盖住期间防误触"。
	   盖着的时候页面在幕后换页，点得到也白点，不如挡住。
	   也一并压过 Element Plus 的 loading 蒙层（2000+），盖幕期间不许它透出来。 */
	z-index: 3999;
	/* 深色世界里的幕布本体：和内容页底色（--stage）同族——
	   亮色 veil 是浅底时代的产物，深舞台上盖一块亮板会闪瞎 */
	background: #2b251d;
	/* 兜底的兜底：JS 永远没起来（水合失败）也不能把用户永远关在幕后，到点自己淡出 */
	animation: curtain-veil-exit 0.6s ease 3.5s forwards;
}

@keyframes curtain-veil-exit {
	to {
		opacity: 0;
		visibility: hidden;
	}
}
</style>
