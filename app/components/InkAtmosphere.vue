<template>
	<!-- 全站氛围层：「后台的幕布」。
	     深一档的暖色布面、竖向褶皱缓慢流动，一束侧光在布面上游移（鼠标横移会轻推它），
	     三层尘埃缓缓上浮、近光者亮。variant 区分两处用法：
	     · login —— 登录卡位置有一圈暖光衬底，pulse() 在登录成功时扩散光环
	     · stage —— 内容页：光斑落在页面中央，更弱更散，卡片群浮在这片暖光里
	     整层都是氛围，对比度刻意压低——主角永远是亮纸卡片和文字。 -->
	<div class="ink-atmosphere" aria-hidden="true">
		<canvas ref="canvasRef"></canvas>
	</div>
	<!-- 巡游金尘（身份）：Teleport 到 body——它要浮在内容卡片之上。
	     沿自己的路径缓慢巡游，鼠标灯靠近时被"吸引"过来；hover 凝聚出浮签（名字+退出）。
	     未登录不渲染。 -->
	<Teleport to="body">
		<template v-if="authStore.token">
			<div ref="kingRef" class="king" :class="{ on: kingHover }">
				<span class="king-core"></span>
			</div>
			<transition name="king-tag">
				<div v-if="kingTagVisible" ref="tagRef" class="king-tag" :style="tagStyle">
					<span class="kt-name">{{ authStore.userInfo?.nickname || authStore.userInfo?.userName || '已进门' }}</span>
					<span class="kt-sep"></span>
					<button class="kt-quit" @click.stop="doLogout">退 出</button>
				</div>
			</transition>
		</template>
	</Teleport>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const props = withDefaults(defineProps<{
	variant?: 'login' | 'stage'
}>(), {
	variant: 'login',
})

const authStore = useAuthStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── 巡游金尘（身份）：沿 Lissajous 路径绕屏游走，鼠标灯靠近时被"吸引"过来；
//    hover 凝聚出浮签（名字+退出）。位置由 JS 每帧算出，DOM/浮签跟随。
//    未登录不渲染。 ──
const kingRef = ref<HTMLElement | null>(null)
const tagRef = ref<HTMLElement | null>(null)
const kingHover = ref(false)
const kingTagVisible = ref(false)
const kingPos = reactive({ x: 0, y: 0 })   // 屏幕像素
const tagStyle = computed(() => ({
	// 右缘收口：金尘巡游到屏幕右缘时浮签不许溢出（宽度按内容估 ~195px）
	left: `${Math.min(kingPos.x + 16, window.innerWidth - 210)}px`,
	top: `${kingPos.y - 14}px`,
}))

// 熄灯离场：先让背景的灯一盏盏熄灭（0.9s 的熄灯波从右往左扫），
// 再清身份、盖幕回门禁——"离场时熄灯"与"进场时点灯"是同一叙事的两端。
// 跳转完成后把 uLightsOut 复位：门禁页揭幕时要正常点灯，不能继承黑场
async function doLogout() {
	kingTagVisible.value = false
	await lightsOut()
	authStore.logout()
	await navigateTo('/login')
	lightsOutT = -1
}

// 熄灯动画完成 Promise（loop 里推进 lightsOutT）
function lightsOut(): Promise<void> {
	return new Promise(resolve => {
		lightsOutT = 0
		const check = () => {
			if (lightsOutT >= 1) resolve()
			else requestAnimationFrame(check)
		}
		requestAnimationFrame(check)
	})
}

// ── 金尘：全屏自由飞行，主容器（卡片群）是从外面撞的"引力体" ──
// 每帧沿 heading 做射线，预测与容器矩形的碰撞落点；接近落点时 heading 向
// 反射方向插值（越近转越急）——直线段自然弯成弧线、擦着容器边缘滑过、
// 再沿弧线抛出，全程无硬反弹的尖角；浅浅擦入时由法线软推兜底。
// 主容器取 main 的第一个元素子节点（.dashboard/.buslines/.markdone…通用拿法）。
// 速度旋钮都集中在这几个常量：
const KING_SPEED = 35      // 巡航速度 px/s
const D_CURVE = 120        // 引力弯预警距离 px：距容器落点这么近就开始转向
const MAX_TURN = 5.9       // 最大转向速率 rad/s（弧线半径 ≈ 速度/速率 ≈ 60px）
const SOFT_PUSH = 10       // 软间距 px：允许浅浅擦入容器的深度，超过由法线推出
const LAMP_R = 160         // 提灯减速半径 px（光晕约 200px，减速区略小）
const HOLD_R = 48          // 浮签触发距离 px
let kingHeading = Math.random() * Math.PI * 2

function smoothstep(a: number, b: number, x: number) {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
	return t * t * (3 - 2 * t)
}

// 射线与矩形求交（slab 法）：
// 起点在矩形外 ⇒ 返回进场距离与命中轴（exiting: false）——容器碰撞用；
// 起点在矩形内 ⇒ 返回离场距离与离开轴（exiting: true）——视口边框碰撞用。
function rayBoxHit(px: number, py: number, dx: number, dy: number, r: DOMRect) {
	let tminX = -Infinity
	let tmaxX = Infinity
	let tminY = -Infinity
	let tmaxY = Infinity
	if (Math.abs(dx) < 1e-6) {
		if (px < r.left || px > r.right) return null
	} else {
		let t1 = (r.left - px) / dx
		let t2 = (r.right - px) / dx
		if (t1 > t2) { const w = t1; t1 = t2; t2 = w }
		tminX = t1
		tmaxX = t2
	}
	if (Math.abs(dy) < 1e-6) {
		if (py < r.top || py > r.bottom) return null
	} else {
		let t1 = (r.top - py) / dy
		let t2 = (r.bottom - py) / dy
		if (t1 > t2) { const w = t1; t1 = t2; t2 = w }
		tminY = t1
		tmaxY = t2
	}
	const tmin = Math.max(tminX, tminY)
	const tmax = Math.min(tmaxX, tmaxY)
	if (tmax < 0) return null
	if (tmin >= 0) return { d: tmin, axis: (tminX >= tminY ? 'x' : 'y') as 'x' | 'y', exiting: false }
	return { d: tmax, axis: (tmaxX <= tmaxY ? 'x' : 'y') as 'x' | 'y', exiting: true }
}

// 障碍列表：页面根容器的直接子块中"不大"的——超高（>75% 视口高）与
// 全宽（>90% 视口宽）的块一律豁免。原因：全宽/超高块在视口内必然形成
// "横墙"或"占满"，会把金尘锁进一条水平缝里（实测竖直活动范围只剩 3px）；
// 豁免后金尘从它们的表面掠过（尘埃在玻璃卡前飞，合理且好看）。
// 小于 40px 的元素（徽章、小按钮）也不当障碍——缝隙太碎会让轨迹发慌。
// 结论：金尘大多数时候在全屏自由飞，块级障碍只在"半宽卡片"布局下起作用。
function obstacleRects(): DOMRect[] {
	const root = document.querySelector('main > *')
	if (!root) return []
	const vw = window.innerWidth
	const vh = window.innerHeight
	const out: DOMRect[] = []
	for (const el of (root as HTMLElement).children) {
		const r = el.getBoundingClientRect()
		if (r.width < 40 || r.height < 40) continue
		if (r.width > vw * 0.9 || r.height > vh * 0.75) continue
		out.push(r)
	}
	return out
}

// 每帧更新金尘：障碍预测 → 引力转向 → 软推兜底 → 灯照调速 → 积分 → 浮签判定
function updateKing(dt: number) {
	if (!authStore.token) return
	const boxes = obstacleRects()

	// 方向缓摆：±25°、7s 周期——短期可预判（能追），长期不重复（有机）
	kingHeading += Math.sin(time * 0.9 + 2.1) * 0.062 * dt
	// 巡游偏向：长时间贴边游荡很呆——离屏幕中心太远时 heading 向中心缓转
	//（极弱转向，只影响"驻留区域"，不改变碰撞/减速行为）
	const cx = window.innerWidth * 0.5
	const cy = window.innerHeight * 0.42            // 视觉中心略偏上（header 占顶）
	const dCenter = Math.hypot(cx - kingPos.x, cy - kingPos.y)
	const pull = Math.max(0, dCenter - Math.min(window.innerWidth, window.innerHeight) * 0.32) / Math.min(window.innerWidth, window.innerHeight)
	if (pull > 0) {
		const ideal = Math.atan2(cy - kingPos.y, cx - kingPos.x)
		let diff = ideal - kingHeading
		diff = Math.atan2(Math.sin(diff), Math.cos(diff))
		kingHeading += Math.sign(diff) * Math.min(Math.abs(diff), pull * 0.5 * dt)
	}

	const dx = Math.cos(kingHeading)
	const dy = Math.sin(kingHeading)

	// ── 引力弯：对每个障碍块做射线预测，取最近落点转向 ──
	// 反射方向：撞竖边（左右）翻 x 轴向，撞横边（上下）翻 y 轴向
	let turnTarget: number | null = null
	let turnDist = Infinity
	for (const r of boxes) {
		const hit = rayBoxHit(kingPos.x, kingPos.y, dx, dy, r)
		if (hit && !hit.exiting && hit.d < D_CURVE && hit.d < turnDist) {
			turnTarget = hit.axis === 'x' ? Math.PI - kingHeading : -kingHeading
			turnDist = hit.d
		}
	}
	// 视口边框：金尘总在视口内 ⇒ 永远是"离场"模式（即将飞出屏幕时弯回来）
	const vw = window.innerWidth
	const vh = window.innerHeight
	const wall = rayBoxHit(kingPos.x, kingPos.y, dx, dy,
		{ left: 4, top: 4, right: vw - 4, bottom: vh - 4 } as DOMRect)
	if (wall && wall.exiting && wall.d < D_CURVE && wall.d < turnDist) {
		turnTarget = wall.axis === 'x' ? Math.PI - kingHeading : -kingHeading
		turnDist = wall.d
	}
	if (turnTarget !== null) {
		let diff = turnTarget - kingHeading
		diff = Math.atan2(Math.sin(diff), Math.cos(diff))   // 取最短旋转方向
		const turn = MAX_TURN * Math.pow(1 - turnDist / D_CURVE, 1.5)
		kingHeading += Math.sign(diff) * Math.min(Math.abs(diff), turn * dt)
	}

	// ── 软推兜底：真侵入某障碍块（换页瞬间落点在块内）⇒ 沿最近边法线推出 ──
	// 注意只在"真进入块内"时触发——外扩区的接近交给上面的转向弯，两套都推会抖
	for (const r of boxes) {
		if (kingPos.x > r.left && kingPos.x < r.right && kingPos.y > r.top && kingPos.y < r.bottom) {
			const dL = kingPos.x - r.left
			const dR = r.right - kingPos.x
			const dT = kingPos.y - r.top
			const dB = r.bottom - kingPos.y
			const m = Math.min(dL, dR, dT, dB)
			if (m === dL) { kingPos.x = r.left - SOFT_PUSH; kingHeading = Math.PI - kingHeading + 0.13 }
			else if (m === dR) { kingPos.x = r.right + SOFT_PUSH; kingHeading = Math.PI - kingHeading + 0.13 }
			else if (m === dT) { kingPos.y = r.top - SOFT_PUSH; kingHeading = -kingHeading + 0.13 }
			else { kingPos.y = r.bottom + SOFT_PUSH; kingHeading = -kingHeading + 0.13 }
			break
		}
	}

	// ── 提灯减速：灯照到 → 速度沿距离衰减到 6%，方向不变；灯移开重新加速（惯性）──
	const mx = mouse.x * window.innerWidth
	const my = mouse.y * window.innerHeight
	const dist = Math.hypot(mx - kingPos.x, my - kingPos.y)
	const speed = KING_SPEED * (0.06 + 0.94 * smoothstep(0, LAMP_R, dist))

	// 积分
	kingPos.x += Math.cos(kingHeading) * speed * dt
	kingPos.y += Math.sin(kingHeading) * speed * dt
	// 视口兜底：不出屏
	kingPos.x = Math.max(4, Math.min(window.innerWidth - 4, kingPos.x))
	kingPos.y = Math.max(4, Math.min(window.innerHeight - 4, kingPos.y))
	if (kingRef.value) kingRef.value.style.transform = `translate(${kingPos.x}px, ${kingPos.y}px)`

	// ── 浮签：距离判定 + 浮签矩形豁免（鼠标在浮签上时保持，否则永远点不到"退出"）──
	let inTag = false
	const tagEl = tagRef.value
	if (tagEl) {
		const r = tagEl.getBoundingClientRect()
		inTag = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom
	}
	kingHover.value = inTag || Math.hypot(mx - kingPos.x, my - kingPos.y) < HOLD_R
}

// 浮签显隐跟随 hover 态（距离判定每帧更新 kingHover）
watch(kingHover, v => {
	kingTagVisible.value = v
})

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
uniform vec3 uSpot;      // 暖光衬底：x, y（屏幕归一）+ 强度
uniform vec2 uLamp;      // 鼠标提灯：光源位置（屏幕归一，平滑跟随）
uniform float uLightsOut; // 熄灯离场 0..1（波前从右往左扫）
uniform vec3 uTint;      // 时段色温（乘法色调：午后偏金、深夜偏冷）
uniform sampler2D uClothSim; // 布料位移场：R/G = 归一化平面位移（±1 ≈ ±24px）
uniform vec2 uBeamDir;   // 舞台灯光的传播方向（每页一个入射角，切页时缓缓摆过去）

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

	// 布料位移场：鼠标拨动注入、向邻域扩散回弹（CPU 模拟，每帧烘进纹理）。
	// 采样位移扭曲布面图案的坐标——"布被拨动时，上面的褶皱和图案跟着扭"；
	// 位移幅度再给布面一点凸起微亮。
	vec2 cd = texture2D(uClothSim, vUv).rg;
	vec2 disp = (cd - 0.5) * 2.0;
	disp.y = -disp.y;                                    // 纹理 v 向上、屏幕 y 向下
	vec2 warpP = p + disp * 0.022;

	// 竖向褶皱，缓慢流动：频率比真幕布低、幅度小——背景要"静"
	float fold = sin(warpP.x * 16.0 + fbm(warpP * 2.4 + uTime * 0.02) * 4.5) * 0.5 + 0.5;
	vec3 col = mix(deep, mid, fold * 0.6);
	col = mix(col, lite, fbm(warpP * 1.7 - uTime * 0.01) * 0.18);
	col *= 1.0 + length(disp) * 0.35;

	// 一束游移的侧光：自己慢慢晃，鼠标横移会轻推它
	vec2 lightC = vec2(0.32 + uMouse.x * 0.06 + sin(uTime * 0.07) * 0.05,
	                   0.28 + cos(uTime * 0.05) * 0.04);
	float dl = distance(p * asp, lightC * asp);
	col += vec3(0.22, 0.17, 0.10) * exp(-dl * dl * 2.4);

	// 鼠标提灯：一盏跟着光标的暖光——照亮的范围内布面微亮、尘埃苏醒。
	// "提着灯走过一间暗房"——这是整个背景的互动核心
	float lampD = distance(p * asp, uLamp * asp);
	float lamp = exp(-lampD * lampD * 3.2);
	col += vec3(0.20, 0.16, 0.09) * lamp * 0.8;

	// 暖光衬底：login = 登录卡被一盏灯照着；stage = 页面中央一片更弱的舞台光
	vec2 cardC = vec2(uSpot.x * aspect, uSpot.y);
	float dc = distance(p * asp, cardC);
	col += vec3(0.15, 0.12, 0.07) * exp(-dc * dc * 2.6) * uSpot.z;

	// ── 舞台灯：三条锥从页外射下，缓慢摆动——深底上才立得住的体积光 ──
	// 光源在 uBeamDir 反方向的外侧；锥心随深度线性散开、半宽随深度增长（真锥形），
	// 远处指数衰减。方向由当前路由的 hash 决定（每页自己的光），切页时缓缓摆过去。
	vec2 dir = normalize(uBeamDir);
	vec2 rel = p * asp - vec2(-0.12, -0.10) * asp;
	float depth = dot(rel, dir);
	float lat = dot(rel, vec2(-dir.y, dir.x));
	float beams = 0.0;
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		float sway = sin(uTime * (0.05 + fi * 0.021) + fi * 2.1);
		float lc = (fi - 1.0) * 0.40 * depth + sway * depth * 0.22;
		float halfw = 0.07 + depth * (0.15 + fi * 0.05);
		float band = exp(-pow((lat - lc) / halfw, 2.0));
		float fade = smoothstep(-0.05, 0.30, depth) * exp(-depth * 0.55);
		beams += band * fade * (0.36 - fi * 0.08);
	}
	col += vec3(1.0, 0.88, 0.56) * beams * 0.30;

	// 登录成功：暖光环从卡片位置扩散（一闪即逝；stage 不触发）
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
		// 点灯进场：揭幕（uReveal 0→1）时尘埃按从左到右的波次"出生"——
		// 波前扫过之后才亮，像剧场开幕时灯一盏盏亮起
		float wave = clamp(uReveal * 1.9 - p.x * 0.85, 0.0, 1.0);
		born *= smoothstep(0.0, 0.45, wave);
		float amp = breathe * born;
		float nearL = exp(-distance(p * asp, lightC * asp) * 1.1);
		// 提灯扫过：靠近鼠标灯的尘埃被点亮——其余沉回布面
		float nearM = exp(-distance(p * asp, uLamp * asp) * 2.2);
		// 舞台灯的光路：光锥里的金屑最亮——"光路里才看得见灰尘"
		float nearB = clamp(beams * 2.2, 0.0, 1.0);
		// 实心点 + 一圈柔光晕："光粒"的体积感
		float pt = smoothstep(0.085, 0.0, dd) + smoothstep(0.30, 0.0, dd) * 0.22;
		dust += pt * amp * ((0.18 + nearL * 0.6) + nearM * 0.85 + nearB * 0.55) * (0.5 - fi * 0.12);
	}
	col += vec3(0.92, 0.86, 0.70) * dust;

	// 四角压暗，把视线收进中间
	float vig = smoothstep(1.3, 0.4, distance(p * asp, vec2(aspect * 0.5, 0.5)));
	col *= mix(0.62, 1.0, vig);

	// 揭幕后从暗到亮 + 成功时整体提亮一拍
	col *= mix(0.5, 1.0, uReveal);
	col *= 1.0 + uPulse * 0.18;

	// 时段色温：午后偏金、深夜偏冷（uTint 由 JS 按当前时间算好传进来）
	col *= uTint;

	// 熄灯离场：波前从右往左扫过，扫过的区域布面/尘埃/光一起沉入黑暗
	//（留 10% 微光不全黑——完全黑掉反而像 bug）。
	// 注意 lit 的方向：波前左侧（还没扫到）是亮的，右侧（已扫过）熄灭——
	// 写反了的话默认态（front=1.05）整屏就只剩最右一条是亮的
	float front = 1.05 - uLightsOut * 1.3;
	float lit = 1.0 - smoothstep(front - 0.03, front + 0.16, p.x);
	col *= mix(0.10, 1.0, lit);

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
// 暖光衬底的基准位置与强度（variant 决定，draw 里绕基准游移）
const spotBase = { x: 0.72, y: 0.5 }
let spotI = 1.0
// 舞台光当前位置（平滑追目标）+ hover 卡片的聚光目标
const spotCur = { x: 0.72, y: 0.5 }
// hover 聚光目标：鼠标悬停的卡片中心（光斑缓缓挪过去）。只跟位置、不提亮度——
// 亮度跳变（0.55→1.0）在横排多卡页面上就是"划过一张亮一张"的闪烁
const spotFocus = { x: 0.5, y: 0.42, active: false }
const onOverRef = ref<((e: MouseEvent) => void) | null>(null)   // 聚光监听（unmount 时移除用）
let lightsOutT = -1      // 熄灯离场进度，-1 = 未触发
let tintRGB: number[] = [1, 1, 1]

// ── 布料位移场：SIM_W×SIM_H 格点的平面位移（px），鼠标拨动注入、
//    向邻域扩散回弹。每帧编码进纹理给 shader 扭曲布面图案。 ──
const SIM_W = 64
const SIM_H = 36
const SIM_AMP = 24       // 位移编码满量程（px）
// noUncheckedIndexedAccess 下 TypedArray 索引被推成 number | undefined——
// 网格尺寸构造时定死、索引全是算出来的，交叉类型收回到 number（同 InkSheet/InkCurtain）
type SimF32 = Float32Array & { [i: number]: number }
let simDisp: SimF32 = new Float32Array(SIM_W * SIM_H * 2)
let simNext: SimF32 = new Float32Array(SIM_W * SIM_H * 2)
let simTex: WebGLTexture | null = null
const simPix = new Uint8Array(SIM_W * SIM_H * 4)
const lastMousePx = { x: -1, y: -1 }

const clamp128 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 127.5 + 127.5)))
let ro: ResizeObserver | null = null

// 每次路由切换（Gate 盖幕→揭开）重播"点灯进场"：尘埃从左到右重新出生；
// 同时舞台灯转向新页面的入射角（路径 hash 决定，±20°）——每个页面有自己的光
const route = useRoute()
const BEAM_BASE = -0.686                       // 基准：光从左上外射向右下
function pathAngle(p: string) {
	let h = 0
	for (let i = 0; i < p.length; i++) h = (h + p.charCodeAt(i) * (i + 7)) % 1000
	return BEAM_BASE + (h / 1000 - 0.5) * 0.7
}
let beamAngle = pathAngle('/')
let beamTarget = beamAngle
watch(() => route.path, () => {
	revealT = 0
	beamTarget = pathAngle(route.path)
})

const UNIFORM_KEYS = ['uRes', 'uTime', 'uMouse', 'uReveal', 'uPulse', 'uSpot', 'uLamp', 'uLightsOut', 'uTint', 'uClothSim', 'uBeamDir'] as const
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
	gl.uniform2f(u.uRes, gl.canvas.width, gl.canvas.height)
	gl.uniform1f(u.uTime, time)
	gl.uniform2f(u.uMouse, mouse.x, mouse.y)
	gl.uniform1f(u.uReveal, revealT)
	gl.uniform1f(u.uPulse, Math.max(0, pulseT))
	gl.uniform2f(u.uLamp, mouse.x, mouse.y)
	// 舞台光：hover 卡片时缓缓挪到那张卡片（只动位置、不动亮度）——
	// 之前 hover 会把强度从 spotI 提满，横排多卡页面上鼠标依次划过 =
	// 光斑反复"亮一下"，就是闪烁；现在只挪位置，灯是连续滑动的
	const baseX = spotBase.x + Math.sin(time * 0.043) * 0.05
	const baseY = spotBase.y + Math.cos(time * 0.031) * 0.04
	const tX = spotFocus.active ? spotFocus.x : baseX
	const tY = spotFocus.active ? spotFocus.y : baseY
	spotCur.x += (tX - spotCur.x) * 0.045
	spotCur.y += (tY - spotCur.y) * 0.045
	gl.uniform3f(u.uSpot, spotCur.x, spotCur.y, spotI)
	gl.uniform1f(u.uLightsOut, Math.max(0, lightsOutT))
	gl.uniform3fv(u.uTint, tintRGB)
	gl.uniform2f(u.uBeamDir, Math.cos(beamAngle), Math.sin(beamAngle))
	gl.activeTexture(gl.TEXTURE0)
	gl.bindTexture(gl.TEXTURE_2D, simTex)
	gl.uniform1i(u.uClothSim, 0)
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
		if (lightsOutT >= 0 && lightsOutT < 1) lightsOutT = Math.min(1, lightsOutT + dt / 0.9)
		beamAngle += (beamTarget - beamAngle) * Math.min(1, dt * 1.2)
		mouse.x += (mouse.tx - mouse.x) * 0.04
		mouse.y += (mouse.ty - mouse.y) * 0.04
		if (!reduced) stepCloth(dt)
		updateKing(dt)
		resize()
		draw()
	}
	raf = requestAnimationFrame(loop)
}

function onMouseMove(e: MouseEvent) {
	mouse.tx = e.clientX / window.innerWidth
	mouse.ty = e.clientY / window.innerHeight
}

// 布料位移场：鼠标拨动注入 → 邻域扩散 → 阻尼回弹 → 编码烘进纹理。
// 手抚过布，布跟着手走一点、然后波纹散开缓缓平复。
function stepCloth(dt: number) {
	const vw = window.innerWidth
	const vh = window.innerHeight
	const mx = mouse.tx * vw
	const my = mouse.ty * vh

	// 拨动注入：光标的移动量按高斯衰减摊给附近格点（"拨"的方向 = 手的方向）
	if (lastMousePx.x >= 0) {
		const mdx = mx - lastMousePx.x
		const mdy = my - lastMousePx.y
		if (Math.hypot(mdx, mdy) > 0.5) {
			const R = 90
			const gx = Math.floor(mouse.tx * SIM_W)
			const gy = Math.floor(mouse.ty * SIM_H)
			for (let j = Math.max(0, gy - 4); j <= Math.min(SIM_H - 1, gy + 4); j++) {
				for (let i = Math.max(0, gx - 5); i <= Math.min(SIM_W - 1, gx + 5); i++) {
					const cx = (i + 0.5) / SIM_W * vw
					const cy = (j + 0.5) / SIM_H * vh
					const d2 = (cx - mx) * (cx - mx) + (cy - my) * (cy - my)
					const fall = Math.exp(-d2 / (R * R * 0.5))
					const k = (j * SIM_W + i) * 2
					simDisp[k] = simDisp[k]! + mdx * fall * 0.2
					simDisp[k + 1] = simDisp[k + 1]! + mdy * fall * 0.2
				}
			}
		}
	}
	lastMousePx.x = mx
	lastMousePx.y = my

	// 演化：向 4 邻扩散（波传播）+ 阻尼（回弹平复）
	const damp = 0.962
	const spread = 0.16
	for (let j = 0; j < SIM_H; j++) {
		for (let i = 0; i < SIM_W; i++) {
			const k = (j * SIM_W + i) * 2
			const l = (Math.max(0, i - 1) + j * SIM_W) * 2
			const r = (Math.min(SIM_W - 1, i + 1) + j * SIM_W) * 2
			const u2 = (i + Math.max(0, j - 1) * SIM_W) * 2
			const d2 = (i + Math.min(SIM_H - 1, j + 1) * SIM_W) * 2
			for (let c = 0; c < 2; c++) {
				const avg = (simDisp[l + c]! + simDisp[r + c]! + simDisp[u2 + c]! + simDisp[d2 + c]!) * 0.25
				simNext[k + c] = simDisp[k + c]! * damp + (avg - simDisp[k + c]!) * spread
			}
		}
	}
	simDisp.set(simNext)

	// 编码进纹理（行序翻转对齐纹理 v 向上）并上传
	for (let j = 0; j < SIM_H; j++) {
		const jf = SIM_H - 1 - j
		for (let i = 0; i < SIM_W; i++) {
			const k = (j * SIM_W + i) * 2
			const p = (jf * SIM_W + i) * 4
			simPix[p] = clamp128(simDisp[k]! / SIM_AMP)
			simPix[p + 1] = clamp128(simDisp[k + 1]! / SIM_AMP)
			simPix[p + 2] = 128
			simPix[p + 3] = 255
		}
	}
	if (gl && simTex) {
		gl.bindTexture(gl.TEXTURE_2D, simTex)
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIM_W, SIM_H, gl.RGBA, gl.UNSIGNED_BYTE, simPix)
	}
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
		console.warn('[InkAtmosphere]', (window as any).__lbErr)
	}
	gl.useProgram(prog)

	u = {} as Locs<typeof UNIFORM_KEYS>
	for (const k of UNIFORM_KEYS) u[k] = gl.getUniformLocation(prog, k)

	// 暖光衬底的基准：login 照着登录卡，stage 落在页面中央、更弱更散
	if (props.variant === 'stage') {
		spotBase.x = 0.5
		spotBase.y = 0.42
		spotI = 0.55
	} else {
		spotBase.x = 0.72
		spotBase.y = 0.5
		spotI = 1.0
	}

	// 布料位移场纹理（LINEAR 采样，FRAG 里当位移用）
	simTex = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, simTex)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIM_W, SIM_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, simPix)

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
	// 舞台灯聚光：hover 到卡片上时，光斑缓缓偏向那张卡片（mouseover 委托，零页面侵入）
	const onOver = (e: MouseEvent) => {
		const t = (e.target as HTMLElement | null)?.closest?.('.panel, .module-card, .welcome-band') as HTMLElement | null
		if (t) {
			const r = t.getBoundingClientRect()
			spotFocus.x = (r.left + r.width / 2) / window.innerWidth
			spotFocus.y = (r.top + r.height / 2) / window.innerHeight
			spotFocus.active = true
		} else {
			spotFocus.active = false
		}
	}
	window.addEventListener('mouseover', onOver, { passive: true })
	onOverRef.value = onOver
	ro = new ResizeObserver(resize)
	ro.observe(canvas)
	raf = requestAnimationFrame(loop)

	// 时段色温：15 点最暖（偏金），凌晨 3 点最冷（偏蓝灰）——挂载时算一次即可
	const h = new Date().getHours() + new Date().getMinutes() / 60
	const w = 0.5 + 0.5 * Math.cos(((h - 15) / 24) * Math.PI * 2)
	tintRGB = [0.92 + 0.14 * w, 0.97 + 0.03 * w, 1.08 - 0.18 * w]
})

// 登录成功时由页面调用：一圈暖光从卡片位置扩散
function pulse() {
	pulseT = 0
}

defineExpose({ pulse, lightsOut })

onBeforeUnmount(() => {
	cancelAnimationFrame(raf)
	raf = 0
	window.removeEventListener('mousemove', onMouseMove)
	if (onOverRef.value) window.removeEventListener('mouseover', onOverRef.value)
	ro?.disconnect()
	ro = null
	if (gl) {
		gl.deleteVertexArray(vao)
		vao = null
		gl.getExtension('WEBGL_lose_context')?.loseContext()
	}
	gl = null
})
</script>

<style scoped>
.ink-atmosphere {
	position: fixed;
	inset: 0;
	/* 必须是 -1：fixed + z-index:0 的定位元素在层叠序里排在所有流内内容
	   （卡片、footer、散字）之上，而不透明 canvas 会把它们整个淹掉——
	   实测 footer 的浅字就是这样消失的。z-index:-1 把它关进 #app 的
	   stacking context 底层：垫在一切内容之下、body 背景之上。 */
	z-index: -1;
	pointer-events: none;
	/* WebGL 拿不到时的兜底底色：和 shader 的中调暖色一致 */
	background: linear-gradient(180deg, #8d7f68, #6b5f4c);
}

.ink-atmosphere canvas {
	display: block;
	width: 100%;
	height: 100%;
}

/* ── 巡游金尘（身份）：Teleport 到 body，z 高于内容、低于 header ── */
.king {
	position: fixed;
	left: 0;
	top: 0;
	width: 10px;
	height: 10px;
	margin: -5px;
	/* 压过 header（200）与 EP 弹层（2000+），只在转场幕布（4000）之下——
	   金尘巡游到任何角落、浮签在任何位置都可点 */
	z-index: 3998;
	pointer-events: auto;
	cursor: pointer;
}

.king-core {
	display: block;
	width: 100%;
	height: 100%;
	border-radius: 50%;
	background: radial-gradient(circle, #ffe9b0 0%, #d9b96a 45%, rgba(217, 185, 106, 0) 78%);
	box-shadow: 0 0 14px rgba(217, 185, 106, 0.7), 0 0 42px rgba(217, 185, 106, 0.28);
	animation: king-pulse 3.2s ease-in-out infinite;
}

@keyframes king-pulse {
	0%, 100% {
		transform: scale(1);
		opacity: 0.88;
	}
	50% {
		transform: scale(1.28);
		opacity: 1;
	}
}

.king-tag {
	position: fixed;
	z-index: 3998;
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 12px 18px;
	background: rgba(30, 26, 18, 0.78);
	backdrop-filter: blur(10px);
	border: 1px solid rgba(236, 228, 212, 0.16);
	border-radius: 12px;
	box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
}

.kt-name {
	font-family: 'Noto Serif SC', serif;
	font-size: 14px;
	letter-spacing: 1px;
	color: var(--on-stage);
	white-space: nowrap;
}

.kt-sep {
	width: 1px;
	height: 14px;
	background: rgba(236, 228, 212, 0.18);
}

.kt-quit {
	font-size: 11px;
	letter-spacing: 2px;
	color: var(--on-stage-faint);
	background: none;
	border: none;
	cursor: pointer;
	transition: color 0.2s ease;
}

.kt-quit:hover {
	color: var(--rose-accent);
}

.king-tag-enter-active {
	transition: all 0.25s cubic-bezier(0.2, 1.2, 0.4, 1);
}

.king-tag-leave-active {
	transition: all 0.18s ease;
}

.king-tag-enter-from {
	opacity: 0;
	transform: translateY(6px) scale(0.96);
}

.king-tag-leave-to {
	opacity: 0;
	transform: translateY(4px);
}
</style>
INKATMO_PART2
INKATMO_PART3
