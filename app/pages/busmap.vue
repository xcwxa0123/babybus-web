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
useHead({ bodyAttrs: { class: 'busmap-workspace' } })

// 搜索与线路状态由 Map.vue 统一管理；此页只负责地图页的标题和整体版式。
</script>

<style scoped>
.busmap-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 地图是固定视口工作区：关闭本页的文档滚动，把可用高度留给工作区。 */
:global(body.busmap-workspace) {
  height: 100dvh;
  overflow: hidden;
}

:global(body.busmap-workspace .app-shell) {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

:global(body.busmap-workspace .app-shell > header) {
  flex: 0 0 7.9vh;
}

:global(body.busmap-workspace .app-shell > main) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

:global(body.busmap-workspace .foot-hem) {
  display: none;
}

:global(body.busmap-workspace footer) {
  height: 34px;
  flex: 0 0 34px;
  padding: 6px 20px;
}

:global(body.busmap-workspace .footer-logo) {
  display: none;
}

:global(body.busmap-workspace .footer-sub) {
  font-size: 10px;
  line-height: 22px;
  letter-spacing: .5px;
}

.busmap-page {
  --map-page-gutter: clamp(20px, 4vw, 56px);
  width: 100%;
  max-width: 1720px;
  margin: 0 auto;
  padding: 6px var(--map-page-gutter) 14px;
  box-sizing: border-box;
}

.busmap-heading {
  min-height: 74px;
  flex: 0 0 74px;
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
  height: auto;
  min-height: 0;
  flex: 1 1 auto;
}

@media (max-width: 760px) {
  .busmap-page {
    --map-page-gutter: 14px;
    padding-top: 4px;
    padding-bottom: 10px;
  }

  .busmap-heading {
    min-height: 68px;
    flex-basis: 68px;
    padding-bottom: 8px;
  }

  .heading-note {
    font-size: 10px;
    padding-left: 10px;
  }

  .busmap-page :deep(.map-wrapper) {
    height: auto;
    min-height: 0;
    flex: 1 1 auto;
  }
}

@media (max-width: 420px) {
  .heading-note {
    display: none;
  }
}

@media (max-width: 760px) and (max-height: 560px) {
  .busmap-heading {
    min-height: 52px;
    flex-basis: 52px;
  }

  .heading-description {
    display: none;
  }

  .heading-title {
    margin-top: 2px;
    font-size: 20px;
  }
}
</style>
