<template>
    
    <!-- HEADER -->
    <header :class=" { scrolled: scrolled } ">
        <div class="logo-area" @click="$router.push('/')">
            <div class="logo-cn">多喝温水</div>
            <div class="logo-en">More drink hot water</div>
        </div>
        <nav>
            <!-- 身份已交给巡游金尘（InkAtmosphere）——header 里不再放任何身份控件，
                 右上角回归纯布景。 -->
        </nav>
    </header>
</template>
<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore();
const scrolled = ref(false);
const loading = ref(false)
const handleScroll = () => { scrolled.value = window.scrollY > 10; };

onMounted(() => {
    window.addEventListener('scroll', handleScroll);
});
onUnmounted(() => window.removeEventListener('scroll', handleScroll));
</script>

<style scoped>
/* header 融进深色舞台：深色毛玻璃，logo/文字翻浅——
   亮色横条会切掉顶部光束的源头区域 */
.logo-cn {
    color: #fffef9;
}

.logo-en {
    color: var(--on-stage-mid);
}

nav {
    display: flex;
    align-items: center;
    gap: 10px;
}
</style>