<template>
	<!-- 幕布实验台（临时页，未挂任何导航）。
	     只留「幕布登场动画」这一件事：方向、时长、方块数量/尺寸、重力、阻尼、透明度都摊开，
	     中间放一张模拟登录卡用来判断文字压在动效上还读不读得清。
	     纸层与墨线已按需求移除（它们仍在 lab2 之外的组件里，本页不再引用）。 -->
	<div v-if="clientReady" class="lab">
		<InkCurtain ref="curtainRef" :dir="curtainDir"
			:duration="curtainDuration" :paused="paused" />

		<!-- 模拟登录卡：判断可读性用 -->
		<div class="lab-card">
			<div class="lc-eyebrow">{{ paused ? 'PAUSED' : 'ACCESS' }}</div>
			<div class="lc-title"><span class="lc-dot"></span>门禁</div>
			<div class="lc-sub">Sign in · 看看就行，别动我数据</div>
			<div class="lc-field">账号 / 邮箱</div>
			<div class="lc-input">请输入账号或邮箱</div>
			<div class="lc-field">密码</div>
			<div class="lc-input">请输入密码</div>
			<div class="lc-btn">登 录</div>
			<div class="lc-foot">还没有账号？立即注册</div>
		</div>

		<!-- 控制台 -->
		<div class="lab-panel">
			<div class="lab-head">
				<span class="lab-dot"></span>
				<div>
					<div class="lab-title">幕布实验台</div>
					<div class="lab-sub">raw WebGL2 · 8 方向 · 撕布边拉开</div>
				</div>
			</div>

			<div class="lab-row"><span class="lab-lbl">方向</span>
				<el-select v-model="curtainDir" size="small" style="flex:1">
					<el-option label="随机（8 个里抽）" value="random" />
					<el-option v-for="(d, k) in CURTAIN_DIRS" :key="k" :label="d" :value="k" />
				</el-select>
				<el-button size="small" @click="replay">重播</el-button>
			</div>
			<div class="lab-row"><span class="lab-lbl">时长</span>
				<el-slider v-model="curtainDuration" :min="0.5" :max="4" :step="0.1" size="small" style="flex:1" />
				<span class="lab-val">{{ curtainDuration.toFixed(1) }}s</span>
			</div>

			<div class="lab-row lab-toggles">
				<el-switch v-model="paused" size="small" active-text="暂停" inline-prompt />
			</div>

			<div class="lab-sec">读数</div>
			<div class="lab-read">
				<div><b>{{ fps }}</b><span>FPS</span></div>
				<div><b>{{ curtainDir === 'random' ? '随机' : '锁定' }}</b><span>方向</span></div>
				<div><b>{{ draws }}</b><span>绘制帧</span></div>
			</div>
			<div class="lab-note">阶段：{{ curtainPhase }}</div>

			<!-- GL 诊断：从 lab2 挪过来的那套读数，用来一眼看出"画不出来"是配置问题还是绘制问题 -->
			<div class="lab-sec">GL 诊断</div>
			<pre class="lab-info">{{ glInfo }}</pre>
		</div>
	</div>
</template>

<script setup lang="ts">
const curtainRef = ref<any>(null)
// 整页客户端渲染：EP 的 useTimeout 在 SSR 收尾时会碰 window，实验台不需要 SSR
const clientReady = ref(false)

// 幕布方向：键与 InkCurtain 里的 DIRS 一致
const CURTAIN_DIRS: Record<string, string> = {
	lt: '从左上', rt: '从右上', lb: '从左下', rb: '从右下',
	left: '从左', right: '从右', top: '从上', bottom: '从下',
}

const curtainDir = ref('random')
const curtainDuration = ref(1.0)
const curtainPhase = ref('—')
const glInfo = ref('等待组件就绪…')
const paused = ref(false)

const fps = ref(0)
const draws = ref(0)
let frames = 0
let fpsAt = 0

function replay() {
	curtainRef.value?.play?.(curtainDir.value)
}

onMounted(() => {
	clientReady.value = true
	const tick = (now: number) => {
		requestAnimationFrame(tick)
		frames++
		if (now - fpsAt > 700) {
			fps.value = Math.round((frames * 1000) / (now - fpsAt))
			frames = 0
			fpsAt = now
			try {
				const d = curtainRef.value?.debug?.()
				if (d) {
					curtainPhase.value = `${d.phase} · ${d.elapsed}s · ${d.dirLabel || d.dir}`
					draws.value = d.draws ?? 0
					glInfo.value = [
						(d.glVersion || 'N/A') + (d.maxAttribs ? '   MAX_VERTEX_ATTRIBS: ' + d.maxAttribs : ''),
						'链接: ' + (d.linked ? 'OK' : '失败') + (d.linkLog ? ' — ' + d.linkLog : ''),
						'属性位置: ' + Object.entries(d.attribLocs || {}).map(([k, v]) => k + '=' + v).join('  '),
						'绘制次数: ' + d.draws,
						'getError: 首次 ' + (d.firstError < 0 ? '0 (NO_ERROR) ✓' : String(d.firstError))
							+ '   最近 ' + d.lastError,
					].join('\n')
				}
			} catch { /* 忽略 */ }
		}
	}
	requestAnimationFrame(tick)
})
</script>

<style scoped>
/* Element Plus 主题变量按页面根类声明；实验台不属于任何正式页面，这里局部声明一份 */
.lab {
	--el-color-primary: var(--sky-accent);
	--el-color-primary-light-3: color-mix(in srgb, var(--sky-accent) 70%, #fff);
	--el-color-primary-light-5: color-mix(in srgb, var(--sky-accent) 50%, #fff);
	--el-color-primary-light-7: color-mix(in srgb, var(--sky-accent) 30%, #fff);
	--el-color-primary-light-8: color-mix(in srgb, var(--sky-accent) 20%, #fff);
	--el-color-primary-light-9: color-mix(in srgb, var(--sky-accent) 12%, #fff);

	position: relative;
	min-height: 100vh;
}

.lab-panel {
	position: fixed;
	top: 96px;
	right: 32px;
	z-index: 5;
	width: 340px;
	padding: 16px 18px 18px;
	background: color-mix(in srgb, var(--paper) 92%, transparent);
	backdrop-filter: blur(8px);
	border: 1px solid rgba(180, 160, 120, 0.14);
	border-radius: 14px;
	box-shadow: var(--shadow-md);
	/* 项目多了之后面板会超过一屏，允许内部滚动，别让它掉到屏幕外面去 */
	max-height: calc(100vh - 130px);
	overflow-y: auto;
}

.lab-head {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding-bottom: 10px;
	margin-bottom: 10px;
	border-bottom: 1px solid rgba(180, 160, 120, 0.12);
}

.lab-dot {
	flex: none;
	width: 6px;
	height: 6px;
	margin-top: 7px;
	border-radius: 50%;
	background: var(--sky-accent);
}

.lab-title {
	font-family: 'Noto Serif SC', serif;
	font-size: 15px;
	font-weight: 700;
	letter-spacing: 1px;
	color: var(--ink);
}

.lab-sub {
	margin-top: 3px;
	font-size: 11px;
	letter-spacing: 0.5px;
	color: var(--ink-light);
}

.lab-sec {
	margin: 14px 0 8px;
	padding-top: 10px;
	border-top: 1px solid rgba(180, 160, 120, 0.12);
	font-size: 10px;
	font-weight: 500;
	letter-spacing: 3px;
	color: var(--sky-accent);
}

.lab-row {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 6px;
}

.lab-lbl {
	flex: none;
	width: 34px;
	font-size: 11px;
	letter-spacing: 1px;
	color: var(--ink-light);
}

.lab-val {
	flex: none;
	width: 46px;
	font-size: 11px;
	text-align: right;
	font-variant-numeric: tabular-nums;
	color: var(--ink-mid);
}

.lab-toggles {
	flex-wrap: wrap;
	gap: 14px;
	margin-top: 12px;
}

.lab-read {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 8px;
}

.lab-read b {
	display: block;
	font-family: 'Playfair Display', serif;
	font-size: 18px;
	line-height: 1.2;
	color: var(--sky-accent);
	font-variant-numeric: tabular-nums;
}

.lab-read span {
	font-size: 10px;
	color: var(--ink-faint);
}

.lab-note {
	margin-top: 10px;
	font-size: 11px;
	line-height: 1.7;
	color: var(--ink-light);
}

.lab-info {
	margin-top: 6px;
	padding: 8px 10px;
	font-size: 10px;
	line-height: 1.75;
	white-space: pre-wrap;
	word-break: break-all;
	color: var(--ink-mid);
	background: var(--cream);
	border-radius: 8px;
}

/* 模拟登录卡 */
.lab-card {
	position: relative;
	z-index: 2;
	width: 380px;
	margin: 120px auto 60px;
	padding: 26px 30px 22px;
	background: var(--paper);
	border: 1px solid rgba(180, 160, 120, 0.14);
	border-radius: 14px;
	box-shadow: var(--shadow-sm);
}

.lc-eyebrow {
	margin-bottom: 6px;
	font-size: 10px;
	font-weight: 500;
	letter-spacing: 3px;
	color: var(--sky-accent);
}

.lc-title {
	font-family: 'Noto Serif SC', serif;
	font-size: 24px;
	font-weight: 700;
	letter-spacing: 3px;
	color: var(--ink);
}

.lc-dot {
	display: inline-block;
	width: 6px;
	height: 6px;
	margin-right: 8px;
	margin-bottom: 4px;
	border-radius: 50%;
	background: var(--sky-accent);
}

.lc-sub {
	margin: 6px 0 20px;
	font-size: 12px;
	color: var(--ink-light);
}

.lc-field {
	margin-bottom: 6px;
	font-size: 12px;
	letter-spacing: 2px;
	color: var(--ink-mid);
}

.lc-input {
	margin-bottom: 16px;
	padding: 8px 12px;
	font-size: 13px;
	color: var(--ink-faint);
	background: var(--paper);
	border: 1px solid var(--ink-faint);
	border-radius: 10px;
}

.lc-btn {
	padding: 9px 0;
	margin-top: 4px;
	font-size: 14px;
	letter-spacing: 4px;
	text-align: center;
	color: #fff;
	background: var(--sky-accent);
	border-radius: 10px;
}

.lc-foot {
	margin-top: 16px;
	padding-top: 14px;
	border-top: 1px solid rgba(180, 160, 120, 0.16);
	font-size: 12px;
	text-align: center;
	color: var(--ink-light);
}
</style>
