// 全局路由守卫：一切换路由就把幕布盖上（视觉上瞬时全遮，页面在幕后完成切换与加载）。
// 开幕时机不在这里管——useCurtainGate 数着接口在途，空档过了自动开。
// 方向按层级粗判：去更深的页面从左拉开（幕布向右退去），退回上层从右拉开。

export default defineNuxtRouteMiddleware((to, from) => {
	if (from && to.path === from.path) return      // 同页的 query/参数变化：不重新盖幕
	const depth = (p?: string) => (p ?? '').replace(/\/+$/, '').split('/').filter(Boolean).length
	const goingUp = !!from && depth(to.path) < depth(from.path)
	useCurtainGate().cover(goingUp ? 'right' : 'left')
})
