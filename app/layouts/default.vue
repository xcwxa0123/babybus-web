<template>
    <!-- app-shell：flex 列外壳，配合 index.css 让页脚在内容不满一屏时贴住视口底部。
         main 是必须的——剩余空间由它吃掉，直接给 <slot /> 没法加样式。 -->
    <div class="app-shell">
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