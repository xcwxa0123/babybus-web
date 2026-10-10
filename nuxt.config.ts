// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-04-16',
  devtools: { enabled: true },
  css: [
    '~/assets/css/font.css',   // 本地字体（@fontsource），替代 fonts.font.im 外链
    '~/assets/css/main.css',

  ],
  modules: ['@element-plus/nuxt', '@pinia/nuxt'],
  app: {
    head: {
      title: 'soymilk'
    }
  },
  vite: {
    optimizeDeps: {
      include: [
        'dayjs', // CJS
        'dayjs/plugin/*.js',
        'lodash-unified',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@tensorflow-models/mobilenet',
        '@element-plus/icons-vue',
      ]
    },
    // build: {
    //   sourcemap: false
    // }
  },
  runtimeConfig: {
    public: {
      mapscKey: '',
      mapsc: '',
      busSearchKey: '',
      dbPath: '',
      redisUrl: '', // Redis 连接地址，如 redis://localhost:6379
      jwtSecret: '', 
    }
  }
})