<template>
	<!-- 全局跳转 Loading / 转场用的幕布：不透明幕布从某个方向拉开。
	     实现要点（都是踩过坑之后定下来的）：
	     1) 全程 raw WebGL2，单画布单上下文。同等的实例化绘制在 ogl 下就是不工作，raw 正常。
	     2) 幕布本体是全屏三角形，方向由 uA·p + uB 的扫描坐标决定。
	     3) 覆盖整页（z-index 高于顶栏与 Element Plus 弹层），但 pointer-events:none。
	     4) 转场的"生动感"由 InkAtmosphere 的点灯进场负责，这里只做干净利落的拉开。 -->
	<div class="ink-curtain" aria-hidden="true">
		<canvas ref="canvasRef"></canvas>
	</div>
</template>

<script setup lang="ts">
// 幕布的 8 个方向：以「从哪里开始拉开」命名。
// 扫描坐标 q = uA·p + uB，p 是屏幕归一化坐标（x 向右、y 向下，和像素一致），q=0 先露出来。
const DIRS: Record<string, { a: [number, number], b: number, label: string }> = {
	lt: { a: [0.5, 0.5], b: 0, label: '从左上' },
	rb: { a: [-0.5, -0.5], b: 1, label: '从右下' },
	rt: { a: [-0.5, 0.5], b: 0.5, label: '从右上' },
	lb: { a: [0.5, -0.5], b: 0.5, label: '从左下' },
	left: { a: [1, 0], b: 0, label: '从左' },
	right: { a: [-1, 0], b: 1, label: '从右' },
	top: { a: [0, 1], b: 0, label: '从上' },
	bottom: { a: [0, -1], b: 1, label: '从下' },
}
const DIR_KEYS = Object.keys(DIRS)

const props = withDefaults(defineProps<{
	autoPlay?: boolean
	dir?: string
	duration?: number
	paused?: boolean
}>(), {
	autoPlay: true,
	dir: 'random',
	duration: 0.6,
	paused: false,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── 着色器：幕布 ──
// 幕布本体是全屏网格（96×54）：拉开中段，布边附近的布面被"拉扯"——顶点沿
// 布边法线回缩 + 横向波纹，FRAG 里同位置一道明暗褶皱带。几何位移和明暗叠加，
// 布褶才是"立体的"。uLift 在拉开中段最大、起手/收尾为 0（全遮帧平静）。
const VERT_CURTAIN = `
attribute vec2 position;   // [0,1]² 网格参数
uniform float uLift;       // 布面隆起强度 0..1
varying vec2 vWarp;        // 位移后的屏幕归一坐标（FRAG 用同一坐标算 q/covered）
varying vec2 vUv;
uniform float uP;
uniform vec2 uA;
uniform float uB;
void main() {
	vec2 uv = position;
	vec2 p = vec2(uv.x, 1.0 - uv.y);
	float q = uA.x * p.x + uA.y * p.y + uB;
	float dEdge = q - uP;
	float band = exp(-dEdge * dEdge * 200.0);
	float ripple = sin(dEdge * 48.0 + uv.x * 5.0 + uP * 6.0) * band * uLift;
	vec2 wp = p + (uA * 0.016 + vec2(-uA.y, uA.x) * 0.011) * ripple;
	gl_Position = vec4(wp.x * 2.0 - 1.0, -(wp.y * 2.0 - 1.0), 0.0, 1.0);
	vWarp = wp;
	vUv = uv;
}
`

const FRAG_CURTAIN = `
precision highp float;
varying vec2 vWarp;
varying vec2 vUv;
uniform float uP;        // 拉开进度 0~1.02（终点越过边界，1.011 以上即完全不遮）
uniform float uLift;     // 布面隆起强度 0..1
uniform vec2 uA;
uniform float uB;
uniform vec3 uCloth;     // 幕布色（比页面背景深一点）
uniform vec3 uCloth2;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
	           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
	return s;
}

void main() {
	// p 是顶点位移后的屏幕坐标（与 VERT 同一套公式）——布面跟着几何一起变形
	vec2 p = vWarp;
	float q = uA.x * p.x + uA.y * p.y + uB;
	// 布边不平直：频率要高、幅度要小——低频大振幅会鼓出一个"补丁"，不像布边
	float wobble = (fbm(vUv * 16.0) - 0.5) * 0.022;
	float edge = uP + wobble;
	float covered = smoothstep(edge - 0.004, edge + 0.010, q);

	// 布面：竖向褶皱 + 低频明暗
	float fold = sin(vUv.x * 26.0 + fbm(vUv * 3.0) * 6.0) * 0.5 + 0.5;
	vec3 col = mix(uCloth, uCloth2, fold * 0.55);
	col = mix(col, uCloth2, fbm(vUv * 4.0) * 0.25);

	// 拉扯褶皱带：幕布侧靠近布边处，一道道垂直于拉开方向的明暗褶皱——
	// 布被拉动的挤压感；起手/收尾 uLift=0 时完全平静
	float dEdge = q - uP;
	float behind = smoothstep(edge + 0.015, edge + 0.05, q) * (1.0 - smoothstep(edge + 0.10, edge + 0.17, q));
	float pull = sin(dEdge * 62.0 + wobble * 40.0) * 0.5 + 0.5;
	col *= 1.0 + (pull - 0.5) * behind * uLift * 0.9;

	col += smoothstep(edge + 0.012, edge + 0.001, q) * step(q, edge + 0.012) * 0.05;

	gl_FragColor = vec4(col, covered);
}
`

// ── 状态 ──
let gl: WebGL2RenderingContext | null = null
let progCurtain: WebGLProgram | null = null
let vaoCurtain: WebGLVertexArrayObject | null = null
let bufCurtain: WebGLBuffer | null = null
let bufIdx: WebGLBuffer | null = null

// uniform 的 key 写成字面量联合，`u.uP` 这类访问才不会在 noUncheckedIndexedAccess
// 下被推成 `WebGLUniformLocation | null | undefined`。
const CURTAIN_KEYS = ['uP', 'uA', 'uB', 'uCloth', 'uCloth2', 'uLift'] as const
type Locs<K extends readonly string[]> = Record<K[number], WebGLUniformLocation | null>

let uCurtain = {} as Locs<typeof CURTAIN_KEYS>

let raf = 0
let elapsed = 0
let last = 0
let running = false
let reduced = false
let dirKey = 'lt'
let phase = 'idle'
let curtainP = 0
let curtainLift = 0        // 布面隆起强度：拉开中段最大（sin(p'×π)），起手/收尾为 0
let curtainIndexCount = 0  // 幕布网格的索引数
let firstError = -1
let lastError = 0
let dpr = 1
let draws = 0
let linkLog = ''
let attribLocs: Record<string, number> = {}
let ro: ResizeObserver | null = null

function readColors() {
	const cs = getComputedStyle(document.documentElement)
	const pick = (name: string, fallback: string): number[] => {
		const raw = cs.getPropertyValue(name).trim() || fallback
		const m = raw.match(/^#?([0-9a-fA-F]{6})$/)
		if (!m) return [0.9, 0.9, 0.9]
		const v = parseInt(m[1] as string, 16)
		return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
	}
	return {
		// 深色世界的幕布：布面用深暖棕（--curtain 系），与内容页底色同族——
		// 转场全程深色，不会在深色 veil 和亮布面之间闪变
		cloth: pick('--curtain', '#3a3226'),
		cloth2: pick('--curtain-2', '#4a4133'),
	}
}

function pickDir() {
	if (props.dir && props.dir !== 'random' && DIRS[props.dir]) return props.dir
	return DIR_KEYS[Math.floor(Math.random() * DIR_KEYS.length)] as string
}

function compile(type: number, src: string) {
	const sh = gl!.createShader(type)!
	gl!.shaderSource(sh, src)
	gl!.compileShader(sh)
	if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
		console.warn('[InkCurtain] 着色器编译失败:', gl!.getShaderInfoLog(sh))
		gl!.deleteShader(sh)
		return null
	}
	return sh
}

function makeProgram(vsSrc: string, fsSrc: string) {
	const vs = compile(gl!.VERTEX_SHADER, vsSrc)
	const fs = compile(gl!.FRAGMENT_SHADER, fsSrc)
	if (!vs || !fs) return null
	const p = gl!.createProgram()!
	gl!.attachShader(p, vs)
	gl!.attachShader(p, fs)
	gl!.linkProgram(p)
	linkLog = gl!.getProgramInfoLog(p) || ''
	if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
		console.warn('[InkCurtain] 链接失败:', linkLog)
		return null
	}
	return p
}

function locs<K extends readonly string[]>(p: WebGLProgram, names: K): Locs<K> {
	const out = {} as Locs<K>
	for (const n of names) {
		// 迭代变量在泛型数组上会被推宽成 string，这里收回字面量联合
		out[n as K[number]] = gl!.getUniformLocation(p, n)
	}
	return out
}

function play(dir?: string) {
	if (!gl || !progCurtain) return
	dirKey = dir && dir !== 'random' && DIRS[dir] ? dir : pickDir()
	gl.useProgram(progCurtain)
	const d = DIRS[dirKey] as { a: [number, number], b: number }
	gl.uniform2f(uCurtain.uA, d.a[0], d.a[1])
	gl.uniform1f(uCurtain.uB, d.b)
	curtainP = 0
	elapsed = 0
	last = 0
	draws = 0
	firstError = -1
	lastError = 0
	running = true
	phase = 'curtain'
	if (!raf) raf = requestAnimationFrame(loop)
}

function resize() {
	const canvas = canvasRef.value
	if (!canvas || !gl) return
	const w = Math.max(1, canvas.clientWidth)
	const h = Math.max(1, canvas.clientHeight)
	dpr = Math.min(window.devicePixelRatio || 1, 2)
	const dw = Math.floor(w * dpr)
	const dh = Math.floor(h * dpr)
	if (canvas.width !== dw || canvas.height !== dh) {
		canvas.width = dw
		canvas.height = dh
	}
	gl.viewport(0, 0, dw, dh)
}

function draw() {
	if (!gl) return
	gl.clearColor(0, 0, 0, 0)
	gl.clear(gl.COLOR_BUFFER_BIT)

	gl.useProgram(progCurtain)
	gl.uniform1f(uCurtain.uP, curtainP)
	gl.uniform1f(uCurtain.uLift, curtainLift)
	gl.bindVertexArray(vaoCurtain)
	gl.drawElements(gl.TRIANGLES, curtainIndexCount, gl.UNSIGNED_SHORT, 0)
	gl.bindVertexArray(null)
	draws++

	const e = gl.getError()
	if (e !== 0) {
		lastError = e
		if (firstError < 0) firstError = e
		while (gl.getError() !== 0) { /* 清空错误队列 */ }
	}
}

function loop(now: number) {
	const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
	last = now

	if (!props.paused && running) {
		elapsed += dt
		const dur = Math.max(0.3, props.duration)
		const p = Math.min(1, elapsed / dur)
		// 终点直接推到 1.02（边界外）：布边自带 fbm 抖动 ±0.011，如果进度停在 1，
		// 抖回来的那半圈会在收尾的角落留一条 14px 的残布。1.02 保证揭开即干净。
		curtainP = 1.02 * (1 - Math.pow(1 - p, 2.2))
		// 隆起强度：拉开中段最大（布被拽得最紧的时候），起手/收尾完全平静
		curtainLift = Math.sin(Math.min(1, curtainP / 1.02) * Math.PI)

		if (elapsed < dur) phase = 'curtain'
		else {
			phase = 'done'
			running = false
		}
	}

	draw()
	raf = 0
	if (running && !props.paused) raf = requestAnimationFrame(loop)
}

function onVisibility() {
	if (reduced) return
	if (document.hidden) {
		cancelAnimationFrame(raf)
		raf = 0
	} else if (!raf && running && !props.paused) {
		last = 0
		raf = requestAnimationFrame(loop)
	}
}

onMounted(() => {
	const canvas = canvasRef.value
	if (!canvas) return
	reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

	gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false })
	if (!gl) {
		console.warn('[InkCurtain] 拿不到 WebGL2 上下文，跳过登场动画')
		return
	}

	progCurtain = makeProgram(VERT_CURTAIN, FRAG_CURTAIN)
	if (!progCurtain) return

	const c = readColors()
	uCurtain = locs(progCurtain, CURTAIN_KEYS)

	// 幕布：全屏网格——拉开中段顶点做拉扯位移，全屏三角做不了局部变形
	const SEG_X = 96
	const SEG_Y = 54
	const verts = new Float32Array((SEG_X + 1) * (SEG_Y + 1) * 2)
	for (let j = 0; j <= SEG_Y; j++) {
		for (let i = 0; i <= SEG_X; i++) {
			const k = (j * (SEG_X + 1) + i) * 2
			verts[k] = i / SEG_X
			verts[k + 1] = j / SEG_Y
		}
	}
	const idx = new Uint16Array(SEG_X * SEG_Y * 6)
	let n = 0
	for (let j = 0; j < SEG_Y; j++) {
		for (let i = 0; i < SEG_X; i++) {
			const a = j * (SEG_X + 1) + i
			const b = a + 1
			const c2 = a + SEG_X + 1
			const d = c2 + 1
			idx[n++] = a; idx[n++] = c2; idx[n++] = b
			idx[n++] = b; idx[n++] = c2; idx[n++] = d
		}
	}
	curtainIndexCount = idx.length

	bufCurtain = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, bufCurtain)
	gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
	bufIdx = gl.createBuffer()
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)

	vaoCurtain = gl.createVertexArray()
	gl.bindVertexArray(vaoCurtain)
	const locPosC = gl.getAttribLocation(progCurtain, 'position')
	gl.bindBuffer(gl.ARRAY_BUFFER, bufCurtain)
	gl.enableVertexAttribArray(locPosC)
	gl.vertexAttribPointer(locPosC, 2, gl.FLOAT, false, 0, 0)
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)   // 索引绑定属于 VAO 状态
	gl.bindVertexArray(null)

	gl.useProgram(progCurtain)
	gl.uniform3fv(uCurtain.uCloth, c.cloth)
	gl.uniform3fv(uCurtain.uCloth2, c.cloth2)
	curtainP = 0

	gl.disable(gl.DEPTH_TEST)
	gl.enable(gl.BLEND)
	gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

	resize()

	ro = new ResizeObserver(resize)
	ro.observe(canvas)
	document.addEventListener('visibilitychange', onVisibility)

	// 注意：幕布进度统一走 curtainP，由 draw() 上传。
	// 直接写 gl.uniform1f(...) 会被随后的 draw() 覆盖回去。
	if (reduced) {
		// 尊重减弱动效：跳过整段动画，直接停在"什么都不遮"的静态一帧
		phase = 'done'
		curtainP = 1.5
		draw()
	} else if (props.autoPlay) {
		play()
	} else {
		// 不自动播放（全局 Loading 用）：只画一帧"什么都不遮"的静态底
		curtainP = 1.5
		draw()
	}
})

watch(() => props.paused, (v) => {
	if (reduced || !running) return
	if (v && raf) {
		cancelAnimationFrame(raf)
		raf = 0
	} else if (!v && !raf) {
		last = 0
		raf = requestAnimationFrame(loop)
	}
})

defineExpose({
	play,
	debug: () => {
		return {
			phase,
			dir: dirKey,
			dirLabel: (DIRS[dirKey] as any)?.label,
			elapsed: Number(elapsed.toFixed(2)),
			duration: props.duration,
			progress: curtainP,
			raf: !!raf,
			// ── 下面几条是给实验台的「GL 诊断」面板用的 ──
			draws,
			linked: !!progCurtain,
			linkLog,
			attribLocs,
			firstError,
			lastError,
			glVersion: gl ? gl.getParameter(gl.VERSION) : null,
			maxAttribs: gl ? gl.getParameter(gl.MAX_VERTEX_ATTRIBS) : null,
		}
	},
})

onBeforeUnmount(() => {
	cancelAnimationFrame(raf)
	raf = 0
	document.removeEventListener('visibilitychange', onVisibility)
	ro?.disconnect()
	ro = null
	if (gl) {
		gl.deleteBuffer(bufCurtain)
		gl.deleteBuffer(bufIdx)
		gl.deleteVertexArray(vaoCurtain)
		gl.deleteProgram(progCurtain)
		gl.getExtension('WEBGL_lose_context')?.loseContext()
	}
	gl = null
})
</script>

<style scoped>
.ink-curtain {
	position: fixed;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
	/* 要盖住顶栏（header 是 200），但实验台面板仍可点。
	   必须压过 Element Plus 的弹层（v-loading/ElMessage 的蒙层从 2000 起递增）：
	   否则跳转后新页面一进 loading，白蒙层就画到幕布上面，揭幕瞬间会闪一下加载样式 */
	z-index: 4000;
}

.ink-curtain canvas {
	display: block;
	width: 100%;
	height: 100%;
}
</style>
