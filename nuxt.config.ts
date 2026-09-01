// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-04-16',
  devtools: { enabled: true },
  css: [
    // '~/assets/css/font.css',
    '~/assets/css/main.css',

  ],
  modules: ['@element-plus/nuxt', '@pinia/nuxt'],
  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.font.im' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.font.im/css2?family=Noto+Serif+SC:wght@300;400;600;700&family=Noto+Sans+SC:wght@300;400;500&family=Playfair+Display:ital,wght@0,700;1,400&display=swap'
        }
      ],
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