import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // Ne pas activer le SW en dev : il peut intercepter `/src/*.tsx` ou les chunks et renvoyer du HTML → erreur MIME « module script ».
      devOptions: {
        enabled: false,
      },
      includeAssets: ['logo.svg', 'favicon.svg', 'icons.svg'],
      manifest: {
        id: '/',
        name: 'SOBOLO CHAT',
        short_name: 'SOBOLO',
        description: 'Messagerie temps réel',
        theme_color: '#f17128',
        background_color: '#f8f9fa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      injectManifest: {
        // Ne pas précacher index.html : après un déploiement, un ancien SW pouvait servir
        // un vieux index pointant vers des chunks supprimés → 404/HTML pour les .js → erreur MIME en prod.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2,webmanifest}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'https://msec-app-rt.onrender.com', changeOrigin: true },
      '/uploads': { target: 'https://msec-app-rt.onrender.com', changeOrigin: true },
    },
  },
})
