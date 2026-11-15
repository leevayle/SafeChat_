import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL?.trim().replace(/\/+$/, '')
  const proxy = apiUrl
    ? {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          ws: true,
        },
        '/health': {
          target: apiUrl,
          changeOrigin: true,
        },
      }
    : undefined

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy,
    },
    preview: {
      host: true,
      port: 5173,
    },
  }
})
