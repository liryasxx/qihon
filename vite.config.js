import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handleContent } from './server/content.mjs';
import { sendNodeResponse } from './server/node.mjs';

const contentApi = {
  name: 'qihon-content-api',
  configureServer(server) {
    server.middlewares.use('/api/content', async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      await sendNodeResponse(await handleContent(url, req.method), res);
    });
  },
};

export default defineConfig({
  plugins: [react(), contentApi, VitePWA({
    registerType: 'prompt',
    includeAssets: ['icons/*.svg', 'icons/*.png'],
    manifest: {
      name: 'Qihon — Manhwa Reader', short_name: 'Qihon',
      description: 'Discover manhwa and read English chapters.',
      theme_color: '#121314', background_color: '#121314',
      display: 'standalone', start_url: '/', scope: '/',
      icons: [
        { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/app-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//],
      // Only the application shell is precached. Reading API data and private
      // account responses are never added to an offline cache.
      cleanupOutdatedCaches: true,
    },
  })],
});
