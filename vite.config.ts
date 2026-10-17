import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { ICON_192, ICON_512, ICON_MASKABLE_192, ICON_MASKABLE_512 } from './src/assets-gen'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '星语小屋',
        short_name: '星语小屋',
        description: '你的 AI 伴侣小屋：聊天、记忆与陪伴',
        theme_color: '#e6e6e2',
        background_color: '#e6e6e2',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: ICON_192, sizes: '192x192', type: 'image/png' },
          { src: ICON_512, sizes: '512x512', type: 'image/png' },
          { src: ICON_MASKABLE_192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: ICON_MASKABLE_512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,webmanifest}'],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
