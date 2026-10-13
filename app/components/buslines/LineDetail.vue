<template>
	<!-- 线路详情（站点列表）：右侧抽屉，不再把页面拉长。
	     append-to 挂到页面根上，这样 busline.css 里 .buslines 命名空间下的样式和主题变量都能生效。

	     必须套 ClientOnly：append-to 指向的 .buslines 是页面内的节点，服务端渲染时它还不存在，
	     于是只吐出一个空 teleport（实测落在文档末尾）；客户端挂载后 overlay 却会插进 .buslines
	     的第一个子节点位置 —— 两边结构不一致，水合按位置对齐时会把 .page-head 这类兄弟节点顶掉
	     （dev 丢 page-head、prod 丢 task-panel，就是同一个错位落在不同节点上）。
	     抽屉本来就不是首屏内容，摘出 SSR 是零代价的。 -->
	<ClientOnly>
		<el-drawer :model-value="modelValue" class="bl-drawer" append-to=".buslines" direction="rtl" size="440px"
			:title="detail?.name || '线路详情'" @update:model-value="(v: boolean) => emit('update:modelValue', v)">
			<div v-if="loading" class="detail-hint">加载中…</div>

			<template v-else-if="detail">
				<div class="detail-id">线路 ID {{ detail.id }}</div>
				<div v-if="detail.start_stop || detail.end_stop" class="detail-route">
					{{ detail.start_stop || '-' }} 至 {{ detail.end_stop || '-' }}
				</div>
				<div class="detail-count">共 {{ detail.busstops?.length ?? 0 }} 站</div>

				<ol class="stops">
					<li v-for="(s, i) in detail.busstops" :key="i">
						<span class="stop-no"
							:style="{ background: colorOf(detail.uicolor), color: contrastOn(detail.uicolor) }">{{ Number(i) + 1 }}</span>
						<div>
							<div class="stop-name">{{ s.name }}</div>
							<div class="stop-loc">{{ s.location }}</div>
						</div>
					</li>
				</ol>
			</template>
		</el-drawer>
	</ClientOnly>
</template>

<script setup lang="ts">
import { colorOf, contrastOn } from '~/utils/busline'

defineProps<{
	modelValue: boolean
	detail: any
	loading: boolean
}>()

const emit = defineEmits<{
	'update:modelValue': [value: boolean]
}>()
</script>
