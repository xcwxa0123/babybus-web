<template>
  <div class="busmap-page">
    <ClientOnly>
      <Map keyword="龙口" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
// 搜索框已整合进 Map.vue 左上角面板中，无需在此重复维护关键词状态，
// 也不再需要用 :key 强制销毁重建 Map 组件（性能更好、无闪屏）。
</script>

<style scoped>
.busmap-page {
  width: 100%;
}
</style>
