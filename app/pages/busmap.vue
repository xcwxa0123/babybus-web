<template>
  <div class="busmap-page">
    <ClientOnly>
      <Map keyword="" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
// 搜索框已整合进 Map.vue 左上角面板中，无需在此重复维护关键词状态，
// 也不再需要用 :key 强制销毁重建 Map 组件（性能更好、无闪屏）。
</script>

<style scoped>
/* 四周留缝：地图与查询面板两张卡片浮在布面上，缝隙透出氛围层 */
.busmap-page {
  width: 100%;
  padding: 16px;
  box-sizing: border-box;
}
</style>
