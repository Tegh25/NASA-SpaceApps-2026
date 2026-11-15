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
      const readBody = async (req: IncomingMessage): Promise<unknown> => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        try {
          return JSON.parse(raw);
        } catch {
          return null; /* handled by validation */
        }
      };

      server.middlewares.use('/api/parse', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
        const body = await readBody(req);
        const { handleParse, featureFetcher } = await server.ssrLoadModule('/api/_lib/parseCore.ts');
        const origin = `http://${req.headers.host}`;
        const result = await handleParse(body, req.socket.remoteAddress ?? 'local', {
          apiKey: env.BACKBOARD_API_KEY,
          model: env.LLM_NAME,
          fetchFeatures: featureFetcher(origin),
        });
        send(res, result.status, result.body);
      });

      server.middlewares.use('/api/explain', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
        const body = await readBody(req);
        const { handleExplain } = await server.ssrLoadModule('/api/_lib/explainCore.ts');
        const result = await handleExplain(body, req.socket.remoteAddress ?? 'local', {
          apiKey: env.BACKBOARD_API_KEY,
          model: env.LLM_NAME,
        });
        send(res, result.status, result.body);
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
    },
  };
});
