import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/TITAN/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
      },
      manifest: {
        name: 'TITAN — Social Media Marketing Intelligence',
        short_name: 'TITAN',
        description: 'Marketing intelligence dashboard untuk 9 akun IG/TT',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/TITAN/',
        scope: '/TITAN/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'recharts-vendor': ['recharts'],
          'icons-vendor': ['lucide-react']
        }
      }
    }
  }
});
