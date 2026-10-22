import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  // Dedicated origins: never silently fall back to another project's port.
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
  preview: { host: '127.0.0.1', port: 5187, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      filename: 'bettrack-sw.js',
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: '/bettrack',
        name: 'BETTRACK · Gestión de banca',
        short_name: 'BETTRACK',
        description: 'Registro privado de apuestas',
        theme_color: '#111b30',
        background_color: '#f6f7fb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        cacheId: 'bettrack',
        maximumFileSizeToCacheInBytes: 40000000,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,gz}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
