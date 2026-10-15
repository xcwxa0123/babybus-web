<template>
	<!-- 登录页：「后台的幕布」。
	     未登录的世界站在幕布这一侧——深暖布面（WebGL 背景）上浮着一张白纸登录卡。
	     登录成功：卡片盖章 + 背景光脉冲 → 盖幕揭工作台（Gate 自动处理转场）。
	     已登录访问此页会被守卫直接送回 /（不盖幕）。 -->
	<div class="login-page">
		<InkAtmosphere ref="backdropRef" />

		<div class="login-stage">
			<!-- 左：品牌语 -->
			<div class="brand-side">
				<div class="brand-cn anim a1">多喝温水</div>
				<div class="brand-en anim a2">MORE DRINK HOT WATER</div>
				<div class="brand-stats anim a3">
					<div class="bs-item"><b>{{ total }}</b><span>收录公交线路</span></div>
					<div class="bs-item"><b>{{ adcodeCount }}</b><span>收录城市</span></div>
				</div>
				<div class="brand-quote anim a4">“不是我说，凭什么有地铁轨道交通线路图，没有公交交通线路图。看不起我们公交车是吧。”</div>
			</div>

			<!-- 右：登录卡 -->
			<div class="card-side">
				<div class="login-card anim a3" :class="{ shake: shaken }">
					<div class="card-seal"></div>
					<div class="card-eyebrow">ACCESS</div>
					<div class="card-title">门 禁</div>
					<div class="card-sub">看看就行，别动我数据</div>

					<div class="field-group">
						<div class="field-label">账号 / 邮箱</div>
						<el-input v-model="loginForm.userName" placeholder="请输入账号或邮箱" @keyup.enter="doLogin" />
						<div v-if="errors.userName" class="field-err">{{ errors.userName }}</div>
					</div>

					<div class="field-group">
						<div class="field-label">密 码</div>
						<el-input v-model="loginForm.password" type="password" placeholder="请输入密码" show-password
							@keyup.enter="doLogin" />
						<div v-if="errors.password" class="field-err">{{ errors.password }}</div>
					</div>

					<div v-if="errMsg" class="form-err">{{ errMsg }}</div>

					<button class="submit" :disabled="loading || stamped" @click="doLogin">
						{{ stamped ? '已 放 行' : (loading ? '验 证 中 …' : '登  录') }}
					</button>

					<div class="card-foot">不给注册 · 数据仅供个人学习</div>

					<!-- 登录成功的"放行章" -->
					<transition name="stamp">
						<div v-if="stamped" class="stamp">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
								stroke-linecap="round" stroke-linejoin="round">
								<path d="M20 6L9 17l-5-5" />
							</svg>
							<span>放 行</span>
						</div>
					</transition>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: false })

const authStore = useAuthStore()
const backdropRef = ref<any>(null)

const loading = ref(false)
const shaken = ref(false)
const stamped = ref(false)
const errMsg = ref('')
const loginForm = reactive({ userName: '', password: '' })
const errors = reactive<Record<string, string>>({})

const total = ref(0)
const adcodeCount = ref(0)

function fail(msg: string) {
	errMsg.value = msg
	shaken.value = true
	setTimeout(() => { shaken.value = false }, 420)
}

async function doLogin() {
	if (loading.value || stamped.value) return
	Object.keys(errors).forEach(k => delete errors[k])
	errMsg.value = ''
	let ok = true
	if (!loginForm.userName.trim()) { errors.userName = '请输入账号或邮箱'; ok = false }
	if (!loginForm.password) { errors.password = '请输入密码'; ok = false }
	if (!ok) return

	loading.value = true
	const res: any = await request('/api/user/login', {
		method: 'POST',
		body: { userName: loginForm.userName, password: loginForm.password }
	})
	if (res.code == 200) {
		// 盖章 + 背景光脉冲，让仪式感走完再进工作台；
		// 跳转本身由全局守卫盖幕接管（去更深的页面从左拉开）。
		authStore.login(res.data.token)
		authStore.setUserInfo(res.data.user)
		stamped.value = true
		backdropRef.value?.pulse?.()
		setTimeout(() => navigateTo('/'), 950)
	} else {
		loading.value = false
		fail(`登录失败：${res.msg || '账号或密码不对'}`)
	}
}

// 首页数据量小徽章：顺带验证接口可达（失败静默，不影响登录）
async function setNum() {
	const numRes: any = await request('/api/buslines/getIndexNum', { method: 'GET' })
	if (numRes.code == 200) {
		total.value = numRes.data.total
		adcodeCount.value = numRes.data.adcodeCount
	}
}

onMounted(setNum)
</script>

<style scoped>
/* 登录前 = 幕布 backstage：整页深暖色，WebGL 背景负责质感，这里只给 CSS 兜底 */
.login-page {
	position: relative;
	min-height: 100vh;
	background: linear-gradient(180deg, #8d7f68, #635746);
	overflow: hidden;
}

.login-stage {
	position: relative;
	z-index: 1;
	min-height: 100vh;
	max-width: 1160px;
	margin: 0 auto;
	padding: 0 56px;
	display: grid;
	grid-template-columns: 1fr minmax(360px, 420px);
	align-items: center;
	gap: 72px;
}

/* ── 左：品牌语 ── */
.brand-cn {
	font-family: 'Noto Serif SC', serif;
	font-size: clamp(44px, 6vw, 74px);
	font-weight: 700;
	letter-spacing: 0.16em;
	/* 固定色：全局 --paper 已改成半透明（内容页毛玻璃用），品牌大字不能跟着变淡 */
	color: #fffef9;
	text-shadow: 0 4px 40px rgba(20, 12, 0, 0.35);
	white-space: nowrap;
}

.brand-en {
	margin-top: 20px;
	font-size: 12px;
	letter-spacing: 0.42em;
	color: rgba(255, 250, 240, 0.5);
}

.brand-stats {
	margin-top: 44px;
	display: flex;
	gap: 40px;
}

.bs-item b {
	display: block;
	font-family: 'Playfair Display', serif;
	font-size: 26px;
	line-height: 1.2;
	color: #fffef9;
	font-variant-numeric: tabular-nums;
}

.bs-item span {
	font-size: 11px;
	letter-spacing: 1px;
	color: rgba(255, 250, 240, 0.45);
}

.brand-quote {
	margin-top: 48px;
	max-width: 380px;
	font-size: 12px;
	line-height: 2;
	color: rgba(255, 250, 240, 0.38);
}

/* ── 右：登录卡 ── */
.login-card {
	position: relative;
	background: var(--paper, #fffef9);
	border: 1px solid rgba(180, 160, 120, 0.25);
	border-radius: 16px;
	padding: 40px 40px 28px;
	box-shadow: 0 30px 80px rgba(25, 16, 4, 0.45), 0 2px 10px rgba(25, 16, 4, 0.2);
}

/* 卡顶的 accent 封条：档案袋标签的既视感 */
.card-seal {
	position: absolute;
	top: -1px;
	left: 40px;
	width: 46px;
	height: 3px;
	background: var(--sky-accent, #4a90c4);
	border-radius: 0 0 2px 2px;
}

.card-eyebrow {
	font-size: 10px;
	font-weight: 500;
	letter-spacing: 3px;
	color: var(--sky-accent, #4a90c4);
}

.card-title {
	margin-top: 6px;
	font-family: 'Noto Serif SC', serif;
	font-size: 28px;
	font-weight: 700;
	letter-spacing: 6px;
	color: var(--ink, #2c2416);
}

.card-sub {
	margin: 6px 0 24px;
	font-size: 12px;
	color: var(--ink-light, #9a8e7d);
}

.field-group {
	margin-bottom: 16px;
}

.field-label {
	margin-bottom: 6px;
	font-size: 12px;
	letter-spacing: 2px;
	color: var(--ink-mid, #5a4e3c);
}

.field-err {
	margin-top: 5px;
	font-size: 12px;
	color: #c0563e;
}

.form-err {
	margin: 2px 0 14px;
	padding: 8px 12px;
	font-size: 12px;
	line-height: 1.6;
	color: #a8452f;
	background: rgba(192, 86, 62, 0.08);
	border-radius: 8px;
}

.submit {
	width: 100%;
	padding: 13px 0;
	margin-top: 10px;
	font-size: 15px;
	letter-spacing: 6px;
	text-indent: 6px;
	color: #fff;
	background: var(--sky-accent, #4a90c4);
	border: none;
	border-radius: 10px;
	cursor: pointer;
	transition: filter 0.2s ease, transform 0.15s ease;
}

.submit:hover:not(:disabled) {
	filter: brightness(1.09);
}

.submit:active:not(:disabled) {
	transform: translateY(1px);
}

.submit:disabled {
	opacity: 0.65;
	cursor: default;
}

.card-foot {
	margin-top: 16px;
	font-size: 11px;
	letter-spacing: 1px;
	text-align: center;
	color: var(--ink-faint, #cac0b0);
}

/* ── 放行章 ── */
.stamp {
	position: absolute;
	top: -22px;
	right: -22px;
	width: 86px;
	height: 86px;
	border-radius: 50%;
	border: 3px solid var(--sky-accent, #4a90c4);
	background: rgba(255, 254, 249, 0.94);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	color: var(--sky-accent, #4a90c4);
	transform: rotate(-12deg);
	box-shadow: 0 10px 30px rgba(25, 16, 4, 0.25);
}

.stamp svg {
	width: 26px;
	height: 26px;
}

.stamp span {
	font-size: 9px;
	font-weight: 500;
	letter-spacing: 3px;
	text-indent: 3px;
}

.stamp-enter-active {
	transition: all 0.35s cubic-bezier(0.2, 1.4, 0.4, 1);
}

.stamp-enter-from {
	opacity: 0;
	transform: rotate(-40deg) scale(1.9);
}

/* ── 失败摇晃 ── */
.shake {
	animation: card-shake 0.42s ease;
}

@keyframes card-shake {
	0%, 100% { transform: translateX(0); }
	20% { transform: translateX(-5px); }
	40% { transform: translateX(5px); }
	60% { transform: translateX(-3px); }
	80% { transform: translateX(3px); }
}

/* ── 揭幕后的错峰淡入 ── */
.anim {
	opacity: 0;
	transform: translateY(14px);
	animation: stage-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.a1 { animation-delay: 0.18s; }
.a2 { animation-delay: 0.3s; }
.a3 { animation-delay: 0.44s; }
.a4 { animation-delay: 0.58s; }

@keyframes stage-up {
	to {
		opacity: 1;
		transform: none;
	}
}

/* ── 响应式 ── */
@media (max-width: 920px) {
	.login-stage {
		grid-template-columns: 1fr;
		gap: 40px;
		padding: 0 24px;
		padding-top: 10vh;
		align-items: start;
	}

	.brand-cn {
		font-size: 40px;
		white-space: normal;
	}

	.brand-stats {
		margin-top: 28px;
		gap: 28px;
	}

	.brand-quote {
		margin-top: 24px;
	}

	.card-side {
		display: flex;
		justify-content: center;
	}

	.login-card {
		width: 100%;
		max-width: 420px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.anim {
		animation: none;
		opacity: 1;
		transform: none;
	}

	.shake {
		animation: none;
	}

	.stamp-enter-active {
		transition: none;
	}
}
</style>
