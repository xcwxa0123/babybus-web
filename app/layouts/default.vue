<template>
    <div>
        <AppHeader />

        <slot />

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