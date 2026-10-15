<template>
	<!-- 全局跳转 Loading / 转场用的幕布：
	     不透明幕布从某个方向拉开，布边上落下透光方块粒子。
	     实现要点（都是踩过坑之后定下来的）：
	     1) 全程 raw WebGL2，单画布单上下文。同等的实例化绘制在 ogl 下就是不工作，raw 正常。
	     2) 粒子属性只有 3 个 vec4（position + aDataA/B/C），打包存放。
	     3) 顶点索引用 Uint16Array；raw 里显式写 UNSIGNED_SHORT。
	     4) 覆盖整页（z-index 高于顶栏），但 pointer-events:none，实验台面板照常可点。 -->
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
	count?: number
	size?: number
	gravity?: number
	restitution?: number      // 第一次触底的恢复系数（越大弹得越高）
	restiDecay?: number       // 每次触底后恢复系数再乘这个值（1 = 不衰减）
	bounceCount?: number      // 允许弹起几次，超过就直接掉出屏幕
	opacity?: number
	paused?: boolean
}>(), {
	autoPlay: true,
	dir: 'random',
	duration: 0.6,
	count: 2000,
	size: 4,
	gravity: 1200,
	restitution: 0.3,
	restiDecay: 1,
	bounceCount: 3,
	opacity: 0.45,
	paused: false,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── 着色器：幕布 ──
const VERT_CURTAIN = `
attribute vec2 position;
varying vec2 vUv;
void main() {
	vUv = position * 0.5 + 0.5;
	gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG_CURTAIN = `
precision highp float;
varying vec2 vUv;
uniform float uP;        // 拉开进度 0~1（1.5 = 完全不遮）
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
	// vUv 来自 NDC，vUv.y = 1 在屏幕上方；而方向表 DIRS 和粒子出生点用的都是
	// "y 向下"的屏幕坐标。这里翻一次统一到屏幕坐标，否则上下与四个对角方向会整体镜像。
	vec2 p = vec2(vUv.x, 1.0 - vUv.y);
	float q = uA.x * p.x + uA.y * p.y + uB;
	// 布边不平直：频率要高、幅度要小——低频大振幅会鼓出一个"补丁"，不像布边
	float wobble = (fbm(vUv * 16.0) - 0.5) * 0.022;
	float edge = uP + wobble;
	float covered = smoothstep(edge - 0.004, edge + 0.010, q);

	// 布面：竖向褶皱 + 低频明暗
	float fold = sin(vUv.x * 26.0 + fbm(vUv * 3.0) * 6.0) * 0.5 + 0.5;
	vec3 col = mix(uCloth, uCloth2, fold * 0.55);
	col = mix(col, uCloth2, fbm(vUv * 4.0) * 0.25);
	col += smoothstep(edge + 0.012, edge + 0.001, q) * step(q, edge + 0.012) * 0.05;

	gl_FragColor = vec4(col, covered);
}
`

// ── 着色器：粒子 ──
const VERT_PART = `
attribute vec2 position;   // 四边形 [-0.5,0.5]^2
attribute vec4 aDataA;     // x, y, tint, size
attribute vec4 aDataB;     // vx, vy, t0, life
attribute vec4 aDataC;     // rot0, spin, streak, 弹性微调

uniform vec2 uRes;
uniform float uTime;
uniform float uGravity;
uniform float uRestitution;
uniform float uRestiDecay;
uniform float uBounceCount;
uniform float uOpacity;

varying vec2 vLocal;
varying float vAlpha;
varying float vStreak;
varying float vTint;

void main() {
	float age = uTime - aDataB.z;
	float life = aDataB.w;
	// 未出生或已消失：塌成一点并推出裁剪体
	if (age < 0.0 || age > life) {
		vLocal = vec2(0.0);
		vAlpha = 0.0;
		vStreak = 0.0;
		vTint = 0.0;
		gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
		return;
	}

	// ── 物理：自由落体 + 触底反弹（解析分段）──
	// 每段都是抛物线；触底时竖直速度反向并乘恢复系数，恢复系数再按 uRestiDecay 衰减；
	// 弹够 uBounceCount 次之后，再触底就直接穿出屏幕。
	// 段数写成常量 5 的循环（GLSL ES 1.00 对循环形式有约束，不用动态条件 + break）。
	float g = max(1.0, uGravity);
	float ground = uRes.y - aDataA.w * 0.5;                  // 方块下沿贴屏幕底
	float e = clamp(uRestitution * aDataC.w, 0.05, 0.98);
	float bouncesLeft = uBounceCount;

	vec2 pos = aDataA.xy;
	float vy = aDataB.y;
	float tLeft = age;
	float segVy0 = vy;
	float segT = 0.0;

	for (int i = 0; i < 5; i++) {
		float disc = vy * vy + 2.0 * g * (ground - pos.y);
		float tHit = disc > 0.0 ? (-vy + sqrt(disc)) / g : -1.0;
		if (tHit >= 0.0 && tHit < tLeft && bouncesLeft > 0.5) {
			// 本段以触地结束：推进到触地点，反弹，进入下一段
			pos.x += aDataB.x * tHit;
			pos.y = ground;
			float vHit = vy + g * tHit;
			tLeft -= tHit;
			vy = -vHit * e;
			bouncesLeft -= 1.0;
			segVy0 = vy;
			segT = 0.0;
		} else {
			// 剩余时间内不触地（或弹跳额度用完）：剩下的直接解析推进
			break;
		}
	}
	// 最后一段的解析推进
	segT += tLeft;
	pos.x += aDataB.x * segT;
	pos.y += segVy0 * segT + 0.5 * g * segT * segT;

	vec2 local = position;
	float cA = cos(aDataC.x + aDataC.y * age);
	float sA = sin(aDataC.x + aDataC.y * age);
	vec2 rot = vec2(local.x * cA - local.y * sA, local.x * sA + local.y * cA);
	// vLocal 给 FRAG 判形状：归一化到 [-1,1]（FRAG 里的 0.78 是方块半宽的判定基准）
	vLocal = rot * 2.0;
	// pos（像素）+ 旋转后的半边长偏移（像素）一起换算 NDC。
	// 别照搬全屏三角形那套 NDC 公式——pos 的量纲是像素，直接乘 2 会把粒子全推出屏幕。
	vec2 world = pos + rot * aDataA.w;
	float fade = 1.0 - smoothstep(life * 0.7, life, age);
	vAlpha = fade * uOpacity;
	vStreak = aDataC.z;   // 闪光条带相位：每个方块错开
	vTint = aDataA.z;
	gl_Position = vec4(
		world.x / uRes.x * 2.0 - 1.0,
		-(world.y / uRes.y * 2.0 - 1.0),
		0.0, 1.0);
}
`

const FRAG_PART = `
precision highp float;
varying vec2 vLocal;
varying float vAlpha;
varying float vStreak;
varying float vTint;

uniform float uTime;
uniform vec3 uGlass;
uniform vec3 uHi;

void main() {
	// 浅色背景上，透光方块只能靠"暗折射边 + 内嵌投影"读出来。
	// 纯白 + 低 alpha 会直接隐形——这是这个项目踩过的坑，别再改回去。
	vec2 lp = vLocal;
	float d = max(abs(lp.x), abs(lp.y)) / 0.78;

	vec2 sp = lp - vec2(0.26, 0.32);
	float ds = max(abs(sp.x), abs(sp.y)) / 0.78;
	float shadow = (1.0 - smoothstep(0.75, 1.30, ds)) * smoothstep(0.80, 1.05, d) * 0.5;

	float inner = 1.0 - smoothstep(0.0, 0.95, d);
	float edgeDark = smoothstep(0.60, 0.90, d) * (1.0 - smoothstep(0.95, 1.02, d));
	float edgeLight = smoothstep(0.86, 0.97, d) * (1.0 - smoothstep(0.99, 1.06, d));

	float band = (vLocal.x * 0.7 + vLocal.y * 0.7) - (fract(vStreak + uTime * 0.12) * 2.6 - 1.3);
	float streak = exp(-band * band * 9.0) * inner;

	vec3 col = mix(uGlass, vec3(0.60, 0.74, 0.88), vTint * 0.45);
	col = mix(col, vec3(0.42, 0.38, 0.32), edgeDark * 0.85);
	col = mix(col, uHi, edgeLight);
	col += uHi * streak * 0.25;

	float a = (inner * 0.10 + edgeDark * 0.42 + edgeLight * 0.85 + streak * 0.20) * vAlpha;
	a = max(a, shadow * vAlpha);
	gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`

// ── 状态 ──
let gl: WebGL2RenderingContext | null = null
let progCurtain: WebGLProgram | null = null
let progPart: WebGLProgram | null = null
let vaoCurtain: WebGLVertexArrayObject | null = null
let vaoPart: WebGLVertexArrayObject | null = null
let bufCurtain: WebGLBuffer | null = null
let bufQuad: WebGLBuffer | null = null
let bufIdx: WebGLBuffer | null = null
let bufA: WebGLBuffer | null = null
let bufB: WebGLBuffer | null = null
let bufC: WebGLBuffer | null = null

// uniform 的 key 写成字面量联合，`u.uP` 这类访问才不会在 noUncheckedIndexedAccess
// 下被推成 `WebGLUniformLocation | null | undefined`。
const CURTAIN_KEYS = ['uP', 'uA', 'uB', 'uCloth', 'uCloth2'] as const
const PART_KEYS = ['uRes', 'uTime', 'uGravity', 'uRestitution', 'uRestiDecay', 'uBounceCount', 'uOpacity', 'uGlass', 'uHi'] as const
type Locs<K extends readonly string[]> = Record<K[number], WebGLUniformLocation | null>

let uCurtain = {} as Locs<typeof CURTAIN_KEYS>
let uPart = {} as Locs<typeof PART_KEYS>

let raf = 0
let elapsed = 0
let last = 0
let running = false
let reduced = false
let dirKey = 'lt'
let phase = 'idle'
let count = 0
let curtainP = 0
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
		cloth: pick('--cream-dark', '#f3ede2'),
		cloth2: pick('--cream', '#faf7f2'),
		glass: pick('--paper', '#fffef9'),
		hi: [1, 1, 1],
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
	if (!gl || !progPart) return
	dirKey = dir && dir !== 'random' && DIRS[dir] ? dir : pickDir()
	gl.useProgram(progCurtain)
	const d = DIRS[dirKey] as { a: [number, number], b: number }
	gl.uniform2f(uCurtain.uA, d.a[0], d.a[1])
	gl.uniform1f(uCurtain.uB, d.b)
	curtainP = 0
	buildParticles()
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
	gl.useProgram(progPart)
	gl.uniform2f(uPart.uRes, w, h)
}

function draw() {
	if (!gl) return
	gl.clearColor(0, 0, 0, 0)
	gl.clear(gl.COLOR_BUFFER_BIT)

	// 先画幕布（不透明），再画粒子（混合）
	gl.useProgram(progCurtain)
	gl.uniform1f(uCurtain.uP, curtainP)
	gl.bindVertexArray(vaoCurtain)
	gl.drawArrays(gl.TRIANGLES, 0, 3)

	gl.useProgram(progPart)
	gl.uniform1f(uPart.uTime, elapsed)
	gl.uniform1f(uPart.uGravity, props.gravity)
	gl.uniform1f(uPart.uRestitution, props.restitution)
	gl.uniform1f(uPart.uRestiDecay, props.restiDecay)
	gl.uniform1f(uPart.uBounceCount, props.bounceCount)
	gl.uniform1f(uPart.uOpacity, props.opacity)
	gl.bindVertexArray(vaoPart)
	gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count)
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
		curtainP = 1 - Math.pow(1 - p, 2.2)

		if (elapsed < dur) phase = 'curtain'
		else if (elapsed < dur + 5.0) phase = 'falling'
		else {
			phase = 'done'
			running = false
			// 1.5：布边有噪声抖动，1.0 会在最后一个角留一条残布
			curtainP = 1.5
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

// 生成粒子数据并打包成 3 个 vec4（顶点属性只有 3 个）
function buildParticles() {
	if (!gl) return
	const dur = Math.max(0.3, props.duration)
	const W = Math.max(1, gl.canvas.width / dpr)
	const H = Math.max(1, gl.canvas.height / dpr)
	const n = Math.max(60, Math.round(props.count * (window.innerWidth < 720 ? 0.55 : 1)))
	count = n

	const rnd = () => Math.random()
	const base = props.size

	const dataA = new Float32Array(n * 4)
	const dataB = new Float32Array(n * 4)
	const dataC = new Float32Array(n * 4)

	const put = (i: number, x: number, y: number, tint: number, sizeV: number,
		vx: number, vy: number, t0: number, life: number,
		rot0: number, spin: number, streak: number, restScale: number) => {
		dataA[i * 4] = x; dataA[i * 4 + 1] = y; dataA[i * 4 + 2] = tint; dataA[i * 4 + 3] = sizeV
		dataB[i * 4] = vx; dataB[i * 4 + 1] = vy; dataB[i * 4 + 2] = t0; dataB[i * 4 + 3] = life
		dataC[i * 4] = rot0; dataC[i * 4 + 1] = spin; dataC[i * 4 + 2] = streak; dataC[i * 4 + 3] = restScale
	}

	// ── 幕布模式：粒子沿布边出生 ──
	const d = DIRS[dirKey] as { a: [number, number], b: number }
	function spawnAtQ(target: number, jitter: number) {
		const x = rnd()
		const y = rnd()
		const q = d.a[0] * x + d.a[1] * y + d.b
		const len2 = d.a[0] * d.a[0] + d.a[1] * d.a[1] || 1
		const x2 = x - ((q - target) / len2) * d.a[0]
		const y2 = y - ((q - target) / len2) * d.a[1]
		return [
			Math.min(1, Math.max(0, x2 + (rnd() - 0.5) * jitter)) * W,
			Math.min(1, Math.max(0, y2 + (rnd() - 0.5) * jitter)) * H,
		]
	}
	// 出生时刻要跟着"缓出后的"布边，而不是线性时刻——否则粒子带会明显落后于布边
	//（幕布进度是 1-(1-p)^2.2，所以反解出 p = 1 - (1-q)^(1/2.2)）。
	const EASE_K = 2.2
	for (let i = 0; i < n; i++) {
		const qi = rnd()
		const [sx, sy] = spawnAtQ(qi, 0.05) as [number, number]
		const birth = dur * (1 - Math.pow(1 - qi, 1 / EASE_K)) * 0.98
		put(i, sx, sy, rnd(), base * (0.55 + rnd() * 0.95),
			(rnd() - 0.5) * 60, 30 + rnd() * 120,
			birth, 5.0 + rnd() * 3.0,
			rnd() * Math.PI * 2, (rnd() - 0.5) * 2.6, rnd(),
			0.85 + rnd() * 0.30)
	}

	gl.bindBuffer(gl.ARRAY_BUFFER, bufA)
	gl.bufferData(gl.ARRAY_BUFFER, dataA, gl.DYNAMIC_DRAW)
	gl.bindBuffer(gl.ARRAY_BUFFER, bufB)
	gl.bufferData(gl.ARRAY_BUFFER, dataB, gl.DYNAMIC_DRAW)
	gl.bindBuffer(gl.ARRAY_BUFFER, bufC)
	gl.bufferData(gl.ARRAY_BUFFER, dataC, gl.DYNAMIC_DRAW)
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
	progPart = makeProgram(VERT_PART, FRAG_PART)
	if (!progCurtain || !progPart) return

	const c = readColors()
	uCurtain = locs(progCurtain, CURTAIN_KEYS)
	uPart = locs(progPart, PART_KEYS)

	// 幕布：一个全屏三角形就够
	bufCurtain = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, bufCurtain)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

	vaoCurtain = gl.createVertexArray()
	gl.bindVertexArray(vaoCurtain)
	const locPosC = gl.getAttribLocation(progCurtain, 'position')
	gl.enableVertexAttribArray(locPosC)
	gl.vertexAttribPointer(locPosC, 2, gl.FLOAT, false, 0, 0)
	gl.bindVertexArray(null)

	// 粒子几何：4 顶点 + Uint16 索引 + 3 个实例属性
	bufQuad = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW)
	bufIdx = gl.createBuffer()
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 2, 1, 3]), gl.STATIC_DRAW)
	bufA = gl.createBuffer(); bufB = gl.createBuffer(); bufC = gl.createBuffer()

	vaoPart = gl.createVertexArray()
	gl.bindVertexArray(vaoPart)
	const locPos = gl.getAttribLocation(progPart, 'position')
	const locA = gl.getAttribLocation(progPart, 'aDataA')
	const locB = gl.getAttribLocation(progPart, 'aDataB')
	const locC = gl.getAttribLocation(progPart, 'aDataC')
	attribLocs = {
		curtain: locPosC,
		position: locPos, aDataA: locA, aDataB: locB, aDataC: locC,
	}
	gl.bindBuffer(gl.ARRAY_BUFFER, bufQuad)
	gl.enableVertexAttribArray(locPos)
	gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0)
	const bindInstanced = (buf: WebGLBuffer, loc: number) => {
		gl!.bindBuffer(gl!.ARRAY_BUFFER, buf)
		gl!.enableVertexAttribArray(loc)
		gl!.vertexAttribPointer(loc, 4, gl!.FLOAT, false, 0, 0)
		gl!.vertexAttribDivisor(loc, 1)
	}
	bindInstanced(bufA, locA)
	bindInstanced(bufB, locB)
	bindInstanced(bufC, locC)
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)   // 索引绑定属于 VAO 状态
	gl.bindVertexArray(null)

	gl.useProgram(progCurtain)
	gl.uniform3fv(uCurtain.uCloth, c.cloth)
	gl.uniform3fv(uCurtain.uCloth2, c.cloth2)
	curtainP = 0

	gl.useProgram(progPart)
	gl.uniform3fv(uPart.uGlass, c.glass)
	gl.uniform3fv(uPart.uHi, c.hi)

	gl.disable(gl.DEPTH_TEST)
	gl.enable(gl.BLEND)
	gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

	resize()
	// 先备一份粒子数据。此时 uTime=0，所有粒子都还没出生（age<0 直接塌成点），
	// 所以不需要额外用 count=0 去"关掉"它们。
	dirKey = pickDir()
	buildParticles()

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
		// 不自动播放：只留粒子层，幕布不遮
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
			particles: count,
			raf: !!raf,
			// ── 下面几条是给实验台的「GL 诊断」面板用的 ──
			draws,
			linked: !!progCurtain && !!progPart,
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
		gl.deleteBuffer(bufQuad); gl.deleteBuffer(bufIdx)
		gl.deleteBuffer(bufA); gl.deleteBuffer(bufB); gl.deleteBuffer(bufC)
		gl.deleteVertexArray(vaoCurtain); gl.deleteVertexArray(vaoPart)
		gl.deleteProgram(progCurtain); gl.deleteProgram(progPart)
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
