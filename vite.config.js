import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Custom plugin: rename scripts/vite-index.template.html → dist/index.html
// so the deploy script can copy dist/index.html → root index.html.
const renameTemplatePlugin = {
  name: 'rename-template',
  closeBundle() {
    return import('node:fs/promises').then(async (fs) => {
      const src = path.resolve(__dirname, 'dist', 'scripts', 'vite-index.template.html');
      const dest = path.resolve(__dirname, 'dist', 'index.html');
      try {
        await fs.access(src);
        await fs.rename(src, dest);
        // Clean up empty dist/scripts/ dir
        await fs.rm(path.resolve(__dirname, 'dist', 'scripts'), { recursive: true, force: true });
      } catch (e) {
        // Already correct or doesn't exist — ignore
      }
    });
  }
};

// V17 — PWA disabled (was vite-plugin-pwa). Reason: the PWA SW aggressively
// precached Vite chunks, and on every deploy old chunks got served from
// the browser cache until a hard refresh. That broke the avatar upgrade
// because users kept seeing the old V15.1 ProxiedAvatar from precache.
// Plain HTTP cache is fine for this dashboard — it's not an offline-first app.
// To restore PWA in the future, install vite-plugin-pwa and add the VitePWA() plugin.
export default defineConfig({
  base: '/TITAN/',
  plugins: [
    react(),
    renameTemplatePlugin
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      // Use scripts/vite-index.template.html as the entry template instead of
      // root index.html. Root index.html is the DEPLOY output (built), not the
      // template — keeping them separate means `pnpm run build` never conflicts
      // with the deployed root index.html.
      input: path.resolve(__dirname, 'scripts/vite-index.template.html'),
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
