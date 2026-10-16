<template>
    <!-- app-shell：flex 列外壳，配合 index.css 让页脚在内容不满一屏时贴住视口底部。
         main 是必须的——剩余空间由它吃掉，直接给 <slot /> 没法加样式。 -->
    <div class="app-shell">
        <!-- 全站氛围层（WebGL 布面 + 舞台灯 + 尘埃）：垫在一切内容之下。
             busmap 的地图是不透明画布，氛围只在四周缝隙和面板毛玻璃上可见 -->
        <InkAtmosphere variant="stage" />
        <AppHeader />

        <main>
            <slot />
        </main>

        <AppFoot />
    </div>
</template>

<script setup lang="ts">
// -TODO 检索后删除searchQuery activeQuery


// 依赖tag检索，暂时不做
// const quickSearch = (tag) => {
//     searchQuery.value = tag;
//     activeQuery.value = tag;
//     closeSearch();
// };
</script>
