// 全局幕布 Loading 的状态机，配合 curtain.global.ts（盖幕）与 request.ts（在途计数）。
// 开幕的三种来源，谁先到谁生效：
//   1. 接口在途清零后空档 280ms——空档是为了防止串行请求之间的间隙（A 回来、B 还没发出）
//      被误判成"加载完了"
//   2. 页面手动 hold()/ready() 声明的东西全部就绪（要等非接口的东西，比如地图 SDK）
//   3. 兜底超时 6s——接口挂了也不能把用户关在幕后
// 计时器只在客户端跑；服务端只把 covering 状态带进 SSR（CSS 预盖层靠它渲染）。

type CurtainDir = 'left' | 'right'

const SETTLE_DELAY = 280
const MAX_WAIT = 6000

// 模块级：页面里会多处调用 useCurtainGate()，计时器必须全局共享一份
let settleTimer: ReturnType<typeof setTimeout> | undefined
let forceTimer: ReturnType<typeof setTimeout> | undefined

export function useCurtainGate() {
	const covering = useState('curtainGate.covering', () => false)
	const dir = useState<CurtainDir>('curtainGate.dir', () => 'left')
	const holds = useState('curtainGate.holds', () => 0)

	function clearTimers() {
		clearTimeout(settleTimer)
		settleTimer = undefined
		clearTimeout(forceTimer)
		forceTimer = undefined
	}

	function reveal() {
		if (!covering.value) return
		covering.value = false
		holds.value = 0
		clearTimers()
	}

	// 在途清零 → 等一段空档，期间没有新请求进来才算真的完事
	function trySettle() {
		if (!covering.value || holds.value > 0) return
		clearTimeout(settleTimer)
		settleTimer = setTimeout(() => {
			if (covering.value && holds.value <= 0) reveal()
		}, SETTLE_DELAY)
	}

	function armForce() {
		clearTimeout(forceTimer)
		forceTimer = setTimeout(reveal, MAX_WAIT)
	}

	function cover(next: CurtainDir = 'left') {
		dir.value = next
		covering.value = true
		holds.value = 0
		clearTimers()
		if (import.meta.client) armForce()
	}

	// request 层的自动计数。只在盖幕期间有效——平时的局部请求（翻页、搜索）一概不算，
	// 不然页面里随手一次查询就会把计数弄成负数、干扰下一次盖幕。
	function hold() {
		if (!covering.value) return
		holds.value++
		clearTimeout(settleTimer)
		settleTimer = undefined
	}
	function ready() {
		if (!covering.value || holds.value <= 0) return
		holds.value--
		if (holds.value === 0) trySettle()
	}

	// 页面挂载完成（page:finish）时由 CurtainGate 调：
	// 从这儿起才允许数空档——cover 发生在路由守卫里，那时新页面还没 mounted，
	// 如果立刻结算会被当成"没事可等"提前开幕。顺便补上兜底计时：
	// 首屏的 cover 跑在 SSR，那边 arm 不了。
	function pageSettled() {
		if (!covering.value) return
		if (!forceTimer) armForce()
		trySettle()
	}

	return { covering, dir, holds, cover, reveal, hold, ready, pageSettled }
}
