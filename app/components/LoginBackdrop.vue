<template>
	<!-- 登录页的 WebGL 背景：「后台的幕布」。
	     登录前的世界还站在幕布这一侧——深一档的暖色布面、竖向褶皱缓慢流动，
	     一束侧光在布面上游移（鼠标横移会轻轻推它），三层尘埃缓缓上浮、近光者亮。
	     登录成功时 pulse()：一圈暖光从登录卡的位置扩散开去。
	     整层都是氛围，对比度刻意压低——主角是那张白纸登录卡。 -->
	<div class="login-backdrop" aria-hidden="true">
		<canvas ref="canvasRef"></canvas>
	</div>
</template>

<script setup lang="ts">
const canvasRef = ref<HTMLCanvasElement | null>(null)

const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
	vUv = position * 0.5 + 0.5;
	gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;     // 平滑后的鼠标（0..1）
uniform float uReveal;   // 揭幕亮起 0..1
uniform float uPulse;    // 登录成功光脉冲 0..1

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
	// 统一到屏幕坐标（y 向下），和 DIRS/粒子那套一致
	vec2 p = vec2(vUv.x, 1.0 - vUv.y);
	float aspect = uRes.x / max(1.0, uRes.y);
	vec2 asp = vec2(aspect, 1.0);

	// 基底：深一档的暖色布面（上亮下暗，像只开了一盏顶灯的后台）
	vec3 deep = vec3(0.34, 0.29, 0.22);
	vec3 mid  = vec3(0.55, 0.48, 0.38);
	vec3 lite = vec3(0.78, 0.71, 0.59);

	// 竖向褶皱，缓慢流动：频率比真幕布低、幅度小——背景要"静"
	float fold = sin(p.x * 16.0 + fbm(p * 2.4 + uTime * 0.02) * 4.5) * 0.5 + 0.5;
	vec3 col = mix(deep, mid, fold * 0.6);
	col = mix(col, lite, fbm(p * 1.7 - uTime * 0.01) * 0.18);

	// 一束游移的侧光：自己慢慢晃，鼠标横移会轻推它
	vec2 lightC = vec2(0.32 + uMouse.x * 0.06 + sin(uTime * 0.07) * 0.05,
	                   0.28 + cos(uTime * 0.05) * 0.04);
	float dl = distance(p * asp, lightC * asp);
	col += vec3(0.22, 0.17, 0.10) * exp(-dl * dl * 2.4);

	// 登录卡位置的一圈暖光衬底：让白纸像被一盏灯照着
	vec2 cardC = vec2(0.72 * aspect, 0.5);
	float dc = distance(p * asp, cardC);
	col += vec3(0.15, 0.12, 0.07) * exp(-dc * dc * 2.6);

	// 登录成功：暖光环从卡片位置扩散（一闪即逝）
	if (uPulse > 0.001) {
		float pr = uPulse * 1.5 * aspect;
		float ring = exp(-pow((dc - pr) * 5.0, 2.0)) * (1.0 - uPulse);
		col += vec3(0.38, 0.32, 0.18) * ring;
	}

	// 漂浮尘埃：三层视差。
	// 每粒一段小圆弧游移（两组不同频率叠加，方向/相位由 hash 抽——合成"歪歪扭扭地游"，
	// 幅度压在半格以内：cell 法的身份随 cell 走，漂出领地会闪换位置）+ 整体缓慢上浮。
	// 明灭分两层：快呼吸（周期 2~4s，平方收对比）× 生命周期（6~11s：
	// 淡入 → 停留 → 熄灭 → 死区）。相位全是 hash 的，任何时刻都有粒子在亮、有粒子在熄。
	float dust = 0.0;
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		float scale = 16.0 + fi * 9.0;
		vec2 dp = (p + vec2(fi * 0.31, fi * 0.57)) * asp * scale;
		vec2 cell = floor(dp);
		vec2 fr = fract(dp);
		float h = hash(cell + fi * 17.0);
		float h2 = hash(cell * 1.37 + fi * 5.1);
		// 基点内缩到 [0.25, 0.75]：给游移留余量，保证不出格
		vec2 star = vec2(0.25, 0.25) + vec2(h, fract(h * 91.7)) * 0.5;
		float ang = h2 * 6.2832;
		float w1 = uTime * (0.35 + h * 0.25);
		float w2 = uTime * (0.55 + h2 * 0.35);
		vec2 sway = vec2(
			cos(ang + w1) * 0.12 + cos(ang * 2.3 - w2) * 0.06,
			sin(ang * 1.7 + w1 * 1.3) * 0.12 + sin(ang * 2.9 + w2) * 0.06
		);
		// 整体缓慢上浮（屏幕 y 向下，上浮 = 减）
		star.y = fract(star.y - uTime * (0.006 + h * 0.010) * (1.0 + fi * 0.4));
		float dd = distance(fr, star + sway);
		// 快呼吸：周期 2~4s，平方让"亮"更扎眼
		float ph1 = uTime * (1.5 + h * 1.6) + h2 * 6.2832;
		float breathe = 0.5 + 0.5 * sin(ph1);
		breathe *= breathe;
		// 生命周期：6~11s，淡入 15%、停留到 60%、再淡出，尾部 15% 完全熄灭
		float life = fract(uTime / (6.0 + h2 * 5.0) + h * 3.7);
		float born = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.60, 0.85, life));
		float amp = breathe * born;
		float nearL = exp(-distance(p * asp, lightC * asp) * 1.1);
		// 实心点 + 一圈柔光晕："光粒"的体积感
		float pt = smoothstep(0.085, 0.0, dd) + smoothstep(0.30, 0.0, dd) * 0.22;
		dust += pt * amp * (0.18 + nearL * 0.6) * (0.5 - fi * 0.12);
	}
	col += vec3(0.92, 0.86, 0.70) * dust;

	// 四角压暗，把视线收进中间
	float vig = smoothstep(1.3, 0.4, distance(p * asp, vec2(aspect * 0.5, 0.5)));
	col *= mix(0.62, 1.0, vig);

	// 揭幕后从暗到亮 + 成功时整体提亮一拍
	col *= mix(0.5, 1.0, uReveal);
	col *= 1.0 + uPulse * 0.18;

	// 极淡颗粒防色带
	col += (hash(gl_FragCoord.xy + fract(uTime) * 7.0) - 0.5) * 0.015;

	gl_FragColor = vec4(col, 1.0);
}
`

let gl: WebGL2RenderingContext | null = null
let raf = 0
let last = 0
let time = 0
let revealT = 0          // 揭幕亮起的进度 0..1
let pulseT = -1          // 脉冲进度，-1 = 未触发
const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
let reduced = false
let ro: ResizeObserver | null = null

const UNIFORM_KEYS = ['uRes', 'uTime', 'uMouse', 'uReveal', 'uPulse'] as const
type Locs<K extends readonly string[]> = Record<K[number], WebGLUniformLocation | null>
let u = {} as Locs<typeof UNIFORM_KEYS>

let vao: WebGLVertexArrayObject | null = null

function resize() {
	const canvas = canvasRef.value
	if (!canvas || !gl) return
	const dpr = Math.min(window.devicePixelRatio || 1, 2)
	const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
	const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w
		canvas.height = h
	}
	gl.viewport(0, 0, w, h)
}

function draw() {
	if (!gl) return
	if (import.meta.dev) {
		;(window as any).__lbF = ((window as any).__lbF || 0) + 1
		if (((window as any).__lbF % 30) === 0) {
			// 定期采样画面中心的像素颜色——"背景是不是黑的"这种问题，数值说话
			const px = new Uint8Array(4)
			gl.readPixels(Math.floor(gl.canvas.width / 2), Math.floor(gl.canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
			;(window as any).__lbPx = Array.from(px)
		}
	}
	gl.uniform2f(u.uRes, gl.canvas.width, gl.canvas.height)
	gl.uniform1f(u.uTime, time)
	gl.uniform2f(u.uMouse, mouse.x, mouse.y)
	gl.uniform1f(u.uReveal, revealT)
	gl.uniform1f(u.uPulse, Math.max(0, pulseT))
	gl.bindVertexArray(vao)
	gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function loop(now: number) {
	const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
	last = now
	if (!document.hidden) {
		if (!reduced) time += dt
		if (revealT < 1) revealT = Math.min(1, revealT + dt / 1.6)
		if (pulseT >= 0) {
			pulseT += dt / 1.1
			if (pulseT > 1) pulseT = -1
		}
		mouse.x += (mouse.tx - mouse.x) * 0.04
		mouse.y += (mouse.ty - mouse.y) * 0.04
		resize()
		draw()
	}
	raf = requestAnimationFrame(loop)
}

function onMouseMove(e: MouseEvent) {
	mouse.tx = e.clientX / window.innerWidth
	mouse.ty = e.clientY / window.innerHeight
}

onMounted(() => {
	const canvas = canvasRef.value
	if (!canvas) return
	reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

	gl = canvas.getContext('webgl2', { alpha: false, antialias: false })
	if (!gl) return    // 拿不到 WebGL2：背景层缺席，页面仍有纯色兜底

	const vs = gl.createShader(gl.VERTEX_SHADER)!
	gl.shaderSource(vs, VERT)
	gl.compileShader(vs)
	const fs = gl.createShader(gl.FRAGMENT_SHADER)!
	gl.shaderSource(fs, FRAG)
	gl.compileShader(fs)
	const prog = gl.createProgram()!
	gl.attachShader(prog, vs)
	gl.attachShader(prog, fs)
	gl.linkProgram(prog)
	// 编译/链接失败时这里没有视觉兜底（canvas 只会黑），把错误捅到 window 方便定位
	const vOk = gl.getShaderParameter(vs, gl.COMPILE_STATUS)
	const fOk = gl.getShaderParameter(fs, gl.COMPILE_STATUS)
	const lOk = gl.getProgramParameter(prog, gl.LINK_STATUS)
	if (!vOk || !fOk || !lOk) {
		;(window as any).__lbErr = (!vOk ? 'VS: ' + gl.getShaderInfoLog(vs) : '')
			+ (!fOk ? 'FS: ' + gl.getShaderInfoLog(fs) : '')
			+ (!lOk ? 'LINK: ' + gl.getProgramInfoLog(prog) : '')
		console.warn('[LoginBackdrop]', (window as any).__lbErr)
	}
	gl.useProgram(prog)

	u = {} as Locs<typeof UNIFORM_KEYS>
	for (const k of UNIFORM_KEYS) u[k] = gl.getUniformLocation(prog, k)

	// 全屏三角形
	const buf = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, buf)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
	vao = gl.createVertexArray()
	gl.bindVertexArray(vao)
	const locPos = gl.getAttribLocation(prog, 'position')
	gl.enableVertexAttribArray(locPos)
	gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0)

	resize()
	draw()
	window.addEventListener('mousemove', onMouseMove, { passive: true })
	ro = new ResizeObserver(resize)
	ro.observe(canvas)
	raf = requestAnimationFrame(loop)
})

// 登录成功时由页面调用：一圈暖光从卡片位置扩散
function pulse() {
	pulseT = 0
}

onBeforeUnmount(() => {
	cancelAnimationFrame(raf)
	raf = 0
	window.removeEventListener('mousemove', onMouseMove)
	ro?.disconnect()
	ro = null
	if (gl) {
		gl.deleteVertexArray(vao)
		vao = null
		gl.getExtension('WEBGL_lose_context')?.loseContext()
	}
	gl = null
})

defineExpose({ pulse })
</script>

<style scoped>
.login-backdrop {
	position: fixed;
	inset: 0;
	z-index: 0;
	pointer-events: none;
	/* WebGL 拿不到时的兜底底色：和 shader 的中调暖色一致 */
	background: linear-gradient(180deg, #8d7f68, #6b5f4c);
}

.login-backdrop canvas {
	display: block;
	width: 100%;
	height: 100%;
}
</style>

