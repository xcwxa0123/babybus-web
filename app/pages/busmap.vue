<template>
  <div class="busmap-page">
    <div class="busmap-heading">
      <div class="heading-copy">
        <div class="heading-eyebrow"><span class="eyebrow-line" /> CITY TRANSIT ATLAS</div>
        <h1 class="heading-title">公交地图</h1>
        <p class="heading-description">沿着线路，认识一座城市的日常脉络。</p>
      </div>
      <div class="heading-note" aria-hidden="true">
        <span class="note-mark">↗</span>
        <span>选择地图上的区域<br />逐层探索城市线路</span>
      </div>
    </div>

    <ClientOnly>
      <Map keyword="" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
// 搜索与线路状态由 Map.vue 统一管理；此页只负责地图页的标题和整体版式。
</script>

<style scoped>
.busmap-page {
  --map-page-gutter: clamp(20px, 4vw, 56px);
  width: 100%;
  max-width: 1720px;
  margin: 0 auto;
  padding: 10px var(--map-page-gutter) 28px;
  box-sizing: border-box;
}

.busmap-heading {
  min-height: 86px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 2px 14px;
}

.heading-eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--on-stage-faint);
  font-family: 'Playfair Display', serif;
  font-size: 10px;
  letter-spacing: 2.4px;
}

.eyebrow-line {
  width: 22px;
  height: 1px;
  background: var(--bl-ochre, #a9701f);
  opacity: .8;
}

.heading-title {
  margin-top: 5px;
  color: var(--on-stage);
  font-family: 'Noto Serif SC', serif;
  font-size: clamp(23px, 2.1vw, 30px);
  font-weight: 600;
  letter-spacing: 4px;
  line-height: 1.35;
}

.heading-description {
  margin-top: 3px;
  color: var(--on-stage-mid);
  font-size: 12px;
  letter-spacing: .5px;
}

.heading-note {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0 9px 16px;
  border-left: 1px solid rgba(236, 228, 212, .18);
  color: var(--on-stage-mid);
  font-size: 11px;
  line-height: 1.7;
  letter-spacing: .4px;
}

.note-mark {
  color: var(--sky-bright);
  font-family: 'Playfair Display', serif;
  font-size: 20px;
}

/* 让地图成为标题下方的主舞台，同时为标题与页脚留出空间。 */
.busmap-page :deep(.map-wrapper) {
  height: clamp(480px, calc(100vh - 7.9vh - 170px), 880px);
}

@media (max-width: 760px) {
  .busmap-page {
    --map-page-gutter: 14px;
    padding-top: 4px;
    padding-bottom: 18px;
  }

  .busmap-heading {
    min-height: 76px;
    padding-bottom: 12px;
  }

  .heading-note {
    font-size: 10px;
    padding-left: 10px;
  }

  .busmap-page :deep(.map-wrapper) {
    height: calc(100vh - 7.9vh - 150px);
    min-height: 480px;
  }
}

@media (max-width: 420px) {
  .heading-note {
    display: none;
  }
}
</style>
