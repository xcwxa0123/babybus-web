<template>
	<!-- 区域地图：逐级下钻选区域，点击即查询该区域的全部线路。
	     整体套 ClientOnly —— AMap 必须在真实 DOM 上初始化，服务端渲染没有意义；
	     而且这类"服务端不渲染、客户端才出现"的组件会把水合结构搞乱
	     （LineDetail 的 append-to 就是这么把 .page-head 顶掉的），从源头避免。 -->
	<ClientOnly>
		<div class="area-map">
			<div class="am-head">
				<div class="am-trail">
					<template v-for="(t, i) in trail" :key="t.adcode + '-' + i">
						<span v-if="i" class="am-sep">›</span>
						<span class="am-crumb" :class="{ current: i === trail.length - 1 }"
							:title="t.name" @click="goTo(i)">{{ t.name }}</span>
					</template>
				</div>
				<div class="am-side">
					<span class="am-hover">{{ hoverName }}</span>
					<span class="am-state">{{ stateText }}</span>
				</div>
			</div>

			<!-- 线路加载状态：全量可能几十批，没有进度会以为卡死了 -->
			<div v-if="lineBusy || lineProgress.total" class="am-lines">
				<div class="am-lines-row">
					<span class="am-lines-text">{{ lineBusy ? '正在加载该区域线路' : (lineError || lineDoneText) }}</span>
					<span class="am-lines-count">{{ lineProgress.drawn }} / {{ lineProgress.total }} 条</span>
					<span v-if="lineBusy" class="am-lines-stop" @click="stopLines(true)">中止</span>
					<el-select v-model="lineEpsilon" size="small" class="am-eps" :disabled="lineBusy"
						@change="reloadLines">
						<el-option :value="20" label="精细" />
						<el-option :value="40" label="标准" />
						<el-option :value="100" label="快速" />
					</el-select>
				</div>
				<div class="am-track">
					<div class="am-fill" :style="{ width: linePercent + '%' }" />
				</div>
			</div>

			<div ref="mapRef" class="am-canvas" :style="{ height: canvasHeight }" />
			<div v-if="error" class="am-error">{{ error }}</div>
		</div>

		<template #fallback>
			<div class="am-fallback" :style="{ height: canvasHeight }">地图加载中…</div>
		</template>
	</ClientOnly>
</template>

<script setup lang="ts">
import { colorOf } from '~/utils/busline'

// 注意：@amap/amap-jsapi-loader **不能**在模块顶层 import ——
// 它的 CJS 版在 import 时就会去读 window，服务端一加载整个页面 500
// （实测报错 "window is not defined"，栈顶就在这个包的第 6 行）。
// 所以放到客户端动态加载，并用 import.meta.client 挡一下：
// 那是编译期常量，服务端打包时整个分支会被摇掉，模块根本不会进服务端产物。

const props = withDefaults(defineProps<{
	/** 当前选中的区域（与左栏区域树共用同一个对象） */
	selected?: any | null
	height?: number
}>(), { selected: null, height: 360 })

const emit = defineEmits<{
	/** 点击某个区域：页面把它当成一次普通的「选中区域」处理（复用 selectArea） */
	select: [row: any]
	/** 回到全国（面包屑点「中国」时） */
	clear: []
}>()

const config = useRuntimeConfig()
const mapRef = ref<HTMLDivElement | null>(null)

// AMap 的实例刻意不放进 ref：它们内部结构庞大，被 Vue 的深度响应式包一层会明显掉帧
let AMap: any = null
let map: any = null
let frame: any = null
let polys: any[] = []
let lineOverlays: any[] = []
// 每次重新查询自增；正在跑的批次循环发现序号变了就自己退出（避免旧结果画到新区域上）
let lineSeq = 0

const ROOT = { adcode: '100000', name: '中华人民共和国', level: 'country' }

const loading = ref(false)
const error = ref('')
const hoverName = ref('')
const children = ref<any[]>([])
const scope = ref<any>({ ...ROOT })
const trail = ref<any[]>([{ ...ROOT }])

const lineBusy = ref(false)
const lineStopped = ref(false) // 手动中止过：进度条停在中途，文案得说清是中止而不是加载完
const lineError = ref('')
const lineEpsilon = ref(40)
const lineProgress = ref({ loaded: 0, total: 0, drawn: 0 })

const canvasHeight = computed(() => `${props.height ?? 360}px`)

const stateText = computed(() => {
	if (error.value) return '边界加载失败'
	if (loading.value) return '正在加载边界…'
	if (!children.value.length) return scope.value.level === 'district' ? '已是最后一级' : '该范围没有下级'
	return `下级 ${children.value.length} 个区域，点击即查询`
})

const linePercent = computed(() => {
	const { loaded, total } = lineProgress.value
	return total ? Math.min(100, Math.round((loaded / total) * 100)) : 0
})

// 渲染条数会小于命中条数：一对正/反向线路只画一条。
// 不写清楚的话，"191 / 343" 看起来像是没加载完。
const lineDoneText = computed(() => {
	const { drawn, total } = lineProgress.value
	if (!total) return '该区域没有线路'
	if (lineStopped.value) return `已中止：命中 ${total} 条，已渲染 ${drawn} 条`
	if (drawn === total) return '线路已加载'
	return `线路已加载：命中 ${total} 条，正/反向合并后渲染 ${drawn} 条`
})

// 服务端为省体积给的是扁平数组 [lng,lat,lng,lat,...]，AMap 的 path 要嵌套格式
function toPath(ring: number[]): number[][] {
	const path: number[][] = []
	for (let i = 0; i + 1 < ring.length; i += 2) path.push([ring[i] as number, ring[i + 1] as number])
	return path
}

// 线路 polyline 字符串 → 若干条路径。用 | 分段的逐段各画一条，
// 不要首尾接起来 —— 那会画出一条根本不存在的"跨段直线"。
function toLinePaths(str: string): number[][][] {
	const out: number[][][] = []
	for (const block of String(str ?? '').split('|')) {
		const path: number[][] = []
		for (const pair of block.split(';')) {
			const comma = pair.indexOf(',')
			if (comma < 0) continue
			const lng = Number(pair.slice(0, comma))
			const lat = Number(pair.slice(comma + 1))
			if (Number.isFinite(lng) && Number.isFinite(lat)) path.push([lng, lat])
		}
		if (path.length >= 2) out.push(path)
	}
	return out
}

function clearBoundaries() {
	for (const p of polys) p.setMap(null)
	polys = []
	if (frame) {
		frame.setMap(null)
		frame = null
	}
}

function clearLines() {
	for (const p of lineOverlays) p.setMap(null)
	lineOverlays = []
}

function stopLines(manual = false) {
	lineSeq++ // 正在跑的循环会看到序号变了，自己退出
	lineBusy.value = false
	// 非手动调用（新一轮加载开始时的清理）顺手复位，省得上一轮的中止标记留到下一轮
	lineStopped.value = manual
}

function setHover(poly: any, on: boolean) {
	poly.setOptions(on
		? { fillOpacity: 0.4, strokeColor: '#c2410c', strokeWeight: 2.4 }
		: { fillOpacity: 0.16, strokeColor: '#5b7c99', strokeWeight: 1 })
}

async function renderScope(precision: 'overview' | 'detail') {
	if (!map) return
	loading.value = true
	error.value = ''
	try {
		const res = await request('/api/citycodes/districts/childrenRings', {
			query: { adcode: scope.value.adcode, precision }
		})
		if (res?.code !== 200) {
			error.value = res?.msg ?? '边界加载失败'
			return
		}

		clearBoundaries()
		children.value = res.data ?? []

		// 面包屑以服务端的祖先链为准（它会把「北京城区」这类虚拟层折叠掉）
		const ancestors = res.scope?.ancestors
		if (Array.isArray(ancestors) && ancestors.length) trail.value = ancestors

		// 当前范围的外框：下钻之后不至于迷失自己在哪
		if (res.scope?.rings?.length) {
			frame = new AMap.Polygon({
				path: res.scope.rings.map(toPath),
				strokeColor: '#b8860b',
				strokeWeight: 2,
				strokeOpacity: 0.9,
				strokeStyle: 'dashed',
				fillOpacity: 0,
				zIndex: 10,
			})
			frame.setMap(map)
		}

		for (const item of children.value) {
			const poly = new AMap.Polygon({
				path: item.rings.map(toPath),
				strokeColor: '#5b7c99',
				strokeWeight: 1,
				strokeOpacity: 0.85,
				fillColor: '#7ba7c9',
				fillOpacity: 0.16,
				cursor: 'pointer',
				zIndex: 20,
			})
			poly.on('mouseover', () => {
				setHover(poly, true)
				hoverName.value = item.name
			})
			poly.on('mouseout', () => {
				setHover(poly, false)
				hoverName.value = ''
			})
			poly.on('click', () => {
				// 点击即查询：只把「选中了什么」告诉页面，页面走它原有的选中流程。
				// 地图这边不自己维护一份选中状态 —— 否则树和地图会各说各话。
				emit('select', { adcode: item.adcode, name: item.name, level: item.level })
			})
			poly.setMap(map)
			polys.push(poly)
		}

		// 视野：有下级就铺满下级，没有下级（区县级）就铺满它自己
		const fit = [...polys]
		if (frame) fit.push(frame)
		if (fit.length) map.setFitView(fit, false, [40, 40, 40, 40])
	} finally {
		loading.value = false
	}
}

// 一对正/反向线路画两遍没有任何意义，还多一倍开销。
// 规则：谁先到画谁，并把它的反向 id 一起记下来，等反向自己出现时跳过 ——
// 不需要预先知道全量数据，分批也照样能正确去重。
function drawLine(line: any, seen: Set<string>): boolean {
	const id = String(line.id)
	if (seen.has(id)) return false
	seen.add(id)
	if (line.direc) seen.add(String(line.direc))

	let drawn = false
	for (const path of toLinePaths(line.polyline)) {
		const poly = new AMap.Polyline({
			path,
			strokeColor: colorOf(line.uicolor),
			strokeWeight: 3,
			strokeOpacity: 0.7,
			lineJoin: 'round',
			zIndex: 30,
		})
		poly.setMap(map)
		lineOverlays.push(poly)
		drawn = true
	}
	return drawn
}

// 只渲染「当前选中区域」的线路：每次重新查询前先清空，
// 所以地图上永远只有这一个区域的结果。
async function loadLines(adcode: string) {
	stopLines()
	clearLines()
	lineError.value = ''
	lineProgress.value = { loaded: 0, total: 0, drawn: 0 }

	if (!adcode || adcode === ROOT.adcode) return

	const token = lineSeq
	lineBusy.value = true
	const seen = new Set<string>()
	const limit = 100

	try {
		for (let offset = 0; ; offset += limit) {
			if (token !== lineSeq) return
			const res = await request('/api/buslines/byAreaAll', {
				query: { adcode, offset, limit, epsilon: lineEpsilon.value }
			})
			if (token !== lineSeq) return
			if (res?.code !== 200) {
				lineError.value = res?.msg ?? '线路加载失败'
				return
			}
			if (!lineProgress.value.total) lineProgress.value.total = res.total ?? 0
			for (const line of res.data ?? []) {
				if (drawLine(line, seen)) lineProgress.value.drawn++
			}
			lineProgress.value.loaded = offset + (res.data?.length ?? 0)
			if (res.done || !res.data?.length) break
		}
	} finally {
		if (token === lineSeq) lineBusy.value = false
	}
}

function reloadLines() {
	const adcode = String(props.selected?.adcode ?? '')
	if (adcode) loadLines(adcode)
}

// 从树上选区域时同步地图：下钻到它，并重新拉它的线路
watch(() => props.selected, (v) => {
	if (!v) {
		if (scope.value.adcode !== ROOT.adcode) {
			scope.value = { ...ROOT }
			renderScope('overview')
		}
		loadLines('') // 回到全部线路：清空地图上的线路
		return
	}
	const adcode = String(v.adcode ?? '')
	if (adcode && adcode !== scope.value.adcode) {
		scope.value = { adcode, name: v.name, level: v.level ?? '' }
		renderScope(adcode === ROOT.adcode ? 'overview' : 'detail')
	}
	loadLines(adcode)
})

function goTo(index: number) {
	if (index < 0 || index >= trail.value.length) return
	if (index === trail.value.length - 1) return
	const target = trail.value[index]
	trail.value = trail.value.slice(0, index + 1)
	scope.value = { adcode: target.adcode, name: target.name, level: target.level }
	if (target.adcode === ROOT.adcode) emit('clear')
	else emit('select', { ...target })
}

// 双击底图回上一级（同时关掉地图自带的双击缩放，否则两个动作会打架）
function goUp() {
	if (trail.value.length > 1) goTo(trail.value.length - 2)
}

async function initMap() {
	if (!import.meta.client) return

	// @ts-ignore 高德要求的安全密钥挂到 window
	window._AMapSecurityConfig = { securityJsCode: config.public.mapsc }

	const { default: AMapLoader } = await import('@amap/amap-jsapi-loader')
	AMap = await AMapLoader.load({
		key: config.public.mapscKey as string,
		version: '2.0',
	})

	map = new AMap.Map(mapRef.value!, {
		zoom: 5,
		center: [104.2, 35.8],
		mapStyle: 'amap://styles/whitesmoke',
		doubleClickZoom: false,
	})

	map.on('dblclick', goUp)
}

onMounted(async () => {
	try {
		await initMap()
		await renderScope('overview')
		// 页面可能在本组件挂载前就已经选好了区域（例如从 URL 或树恢复）
		if (props.selected?.adcode) loadLines(String(props.selected.adcode))
	} catch (e) {
		error.value = `地图初始化失败：${String(e)}`
	}
})

onUnmounted(() => {
	stopLines()
	clearLines()
	clearBoundaries()
	map?.destroy()
	map = null
})
</script>
