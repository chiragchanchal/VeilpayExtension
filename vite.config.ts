import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import manifest from './src/manifest.config.ts';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    // Extension URLs (chrome-extension://) don't support CORS headers, so the
    // `crossorigin` attribute on module scripts / preload links causes the
    // browser to silently refuse to load them, resulting in a blank popup.
    {
      name: 'strip-crossorigin',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler(html: string): string {
          return html.replace(/crossorigin\s*/g, '');
        },
      },
    },
  ],
  // The WalletConnect SDK (and some of its transitive deps) references Node
  // globals during module evaluation. MV3 service workers have no `process`
  // or bare `global`, so substitute safe equivalents at build time. Without
  // these the dynamically-loaded WC chunk would throw once it is used.
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
    // Prevent stale assets from a dev build leaking into a prod build.
    emptyOutDir: true,
    // Deterministic output: no hashes in filenames, stable chunk names.
    // Required for the reproducible-build / published-bundle-hash gate (4.10).
    sourcemap: false,
    rollupOptions: {
      // popup / options / sidepanel are discovered through the manifest by crxjs.
      // The offscreen document is created at runtime, so it needs a declared entry.
      input: {
        offscreen: 'offscreen.html',
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  // Fail loudly if the dev port is taken (CRXJS bakes the port into the service
  // worker loader, so a silent port drift leaves the extension staring at a dead
  // dev server).
  server: { strictPort: true },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/manifest.config.ts'],
    },
  },
});
