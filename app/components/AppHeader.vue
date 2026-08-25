<template>
    
    <!-- HEADER -->
    <header :class=" { scrolled: scrolled } ">
        <div class="logo-area" @click="$router.push('/')">
            <div class="logo-cn"><span class="logo-dot"></span>多喝温水</div>
            <div class="logo-en">More drink hot water</div>
        </div>
        <nav>
        </nav>
    </header>
</template>
<script setup lang="ts">

const scrolled = ref(false);
const loading = ref(false)
const handleScroll = () => { scrolled.value = window.scrollY > 10; };

onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));
</script>