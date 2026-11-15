import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawApiUrl = env.VITE_API_URL?.trim()
  if (!rawApiUrl) {
    throw new Error('VITE_API_URL is required in admin/.env or the build environment')
  }
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(rawApiUrl)
    ? rawApiUrl
    : `${/^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(rawApiUrl) ? 'http' : 'https'}://${rawApiUrl}`
  const backendUrl = new URL(candidate)
  if (backendUrl.protocol !== 'http:' && backendUrl.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use HTTP or HTTPS')
  }
  const apiUrl = backendUrl.origin

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
