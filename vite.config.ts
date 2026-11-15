/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesium';

/** Serves /api/parse and /api/explain during `vite dev` using the same cores as the Vercel functions. */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'terralog-dev-api',
    configureServer(server) {
      const send = (res: ServerResponse, status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(body));
      };
      /** POST-only JSON endpoint with a body cap, content-type check and a catch-all 500, so dev behaves like a hardened function. */
      const route = (path: string, handle: (body: unknown, req: IncomingMessage) => Promise<{ status: number; body: unknown }>) => {
        server.middlewares.use(path, async (req: IncomingMessage, res: ServerResponse) => {
          try {
            if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
            const { readJsonBody } = await server.ssrLoadModule('/api/_lib/http.ts');
            const parsed = await readJsonBody(req, req.headers['content-type']);
            if (!parsed.ok) return send(res, parsed.status, { error: parsed.error });
            const result = await handle(parsed.body, req);
            send(res, result.status, result.body);
          } catch (e) {
            server.config.logger.error(`[dev-api] ${path} failed: ${(e as Error).message}`);
            if (!res.headersSent) send(res, 500, { fallback: true, reason: 'server_error' });
          }
        });
      };

      route('/api/parse', async (body, req) => {
        const { handleParse, featureFetcher, resolveOrigin } = await server.ssrLoadModule('/api/_lib/parseCore.ts');
        const origin = resolveOrigin(req.headers.host, 'http');
        if (!origin) return { status: 400, body: { error: 'Invalid host header.' } };
        return handleParse(body, req.socket.remoteAddress ?? 'local', {
          apiKey: env.BACKBOARD_API_KEY,
          model: env.LLM_NAME,
          fetchFeatures: featureFetcher(origin),
        });
      });

      route('/api/explain', async (body, req) => {
        const { handleExplain } = await server.ssrLoadModule('/api/_lib/explainCore.ts');
        return handleExplain(body, req.socket.remoteAddress ?? 'local', { apiKey: env.BACKBOARD_API_KEY, model: env.LLM_NAME });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      viteStaticCopy({
        targets: ['ThirdParty', 'Workers', 'Assets', 'Widgets'].map((dir) => ({
          src: `${cesiumSource}/${dir}`,
          dest: cesiumBaseUrl,
          rename: { stripBase: cesiumSource.split('/').length },
        })),
      }),
      devApi(env),
    ],
    define: {
      CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
      __CESIUM_ION_TOKEN__: JSON.stringify(env.CESIUM_ION_TOKEN ?? ''),
    },
    build: {
      chunkSizeWarningLimit: 6000,
    },
    test: {
      include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
      // vitest 5.1.0 with Node 22 on Windows: the default forks and the threads pools fail every file with
      // "Vitest failed to find the current suite". The VM pool runs them correctly.
      pool: 'vmThreads',
    },
  };
});
