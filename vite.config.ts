/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesium';

/** Serves /api/parse during `vite dev` using the same core as the Vercel function. */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'terralog-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/parse', async (req: IncomingMessage, res: ServerResponse) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let body: unknown = null;
        try {
          body = JSON.parse(raw);
        } catch {
          /* handled by validation */
        }
        const { handleParse, featureFetcher } = await server.ssrLoadModule('/api/_lib/parseCore.ts');
        const origin = `http://${req.headers.host}`;
        const result = await handleParse(body, req.socket.remoteAddress ?? 'local', {
          apiKey: env.BACKBOARD_API_KEY,
          model: env.LLM_NAME,
          fetchFeatures: featureFetcher(origin),
        });
        send(result.status, result.body);
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
