import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config
 * ---------------------------------------------------------------------------
 * • `host: true` binds 0.0.0.0 so the sandbox/phone preview proxy can reach it.
 * • `allowedHosts: true` accepts the *.e2b.app preview host (and any future
 *   tunnel hostname) — otherwise Vite answers "Blocked request".
 * • The dev server proxies /api and /uploads to the backend, which means the
 *   React code can use relative URLs and NO endpoint is hardcoded anywhere.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      allowedHosts: true,
      hmr: { clientPort: 443 },
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true, secure: false },
        '/uploads': { target: proxyTarget, changeOrigin: true, secure: false },
      },
    },
    preview: {
      host: true,
      port: 4173,
      allowedHosts: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
    },
  };
});
