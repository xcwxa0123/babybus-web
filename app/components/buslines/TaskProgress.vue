<template>
	<!-- 任务进度：标题 + 进度条 + 四格统计 + 日志。「循环拉取」和「区域映射」共用 -->
	<div class="task-progress">
		<div class="run-head">
			<div>
				<div class="run-title">{{ title }}</div>
				<div class="run-sub">{{ sub }}</div>
			</div>
			<el-tag :type="running ? 'warning' : 'success'" effect="light" round>{{ tag }}</el-tag>
		</div>

		<el-progress :percentage="percent" :stroke-width="8" :status="running ? '' : 'success'" />

		<div class="stats">
			<div v-for="s in stats" :key="s.label" class="stat" :class="s.tone">
				<b>{{ s.value }}</b><span>{{ s.label }}</span>
			</div>
		</div>

		<div class="log">
			<el-scrollbar max-height="200px">
				<div v-for="(line, i) in log" :key="i" class="log-line">{{ line }}</div>
			</el-scrollbar>
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	title: string
	sub: string
	tag: string
	running: boolean
	percent: number
	stats: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }[]
	log: string[]
}>()
</script>
