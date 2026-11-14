import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In local dev, serve api/action.js the same way Vercel does in production,
// so the whole dashboard can be tested with just `npm run dev`.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/action', async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
        try {
          const { default: handler } = await server.ssrLoadModule('/api/action.js');
          await handler(req, res);
        } catch (e) {
          console.error('[api/action]', e);
          if (!res.headersSent) res.status(500).json({ ok: false, error: 'Server error: ' + e.message });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), tailwindcss(), localApi()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: { charts: ['recharts'], supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] },
        },
      },
    },
  };
});
