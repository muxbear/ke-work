import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@router': resolve('src/renderder/src/router'),
        '@store': resolve('src/renderer/src/store'),
        '@views': resolve('src/renderer/views'),
        '@components': resolve('src/renderer/src/components')
      }
    },
    plugins: [vue()],
    server: {
      // 配置代理
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  }
})
