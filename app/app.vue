<template>
  <div>
    <NuxtLayout>
      <NuxtPage/>
    </NuxtLayout>
    <!-- 全局跳转 Loading：路由守卫盖幕、接口查完开幕（见 useCurtainGate） -->
    <CurtainGate />
  </div>
</template>
