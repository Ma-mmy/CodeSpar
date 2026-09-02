import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const backendPort = process.env.CODESPAR_PORT || '8099'
const vitePort = Number(process.env.CODESPAR_VITE_PORT || 5173)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: vitePort,
    // 并行 worktree 用 CODESPAR_PORT / CODESPAR_VITE_PORT 错开端口。
    // 生产模式：前端产物打进 jar，同源，无需代理。
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        // 出题 SSE / 长耗时请求：避免代理默认超时掐断进度流
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
