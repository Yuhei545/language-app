import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: '言語学習',
        short_name: 'LLA',
        description: '英語と韓国語を自分のペースで学ぶアプリ',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        theme_color: '#0f766e',
        background_color: '#f8fbfa',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    watch: {
      // テストファイルや TypeScript の中間ファイルの変更でページ全体を再読み込みしない
      // (レッスンや会話の途中で状態が消える原因になっていた)
      ignored: ['**/*.test.ts', '**/*.test.tsx', '**/*.tsbuildinfo', '**/node_modules/.tmp/**'],
    },
  },
  test: {
    environment: 'jsdom',
  },
})
