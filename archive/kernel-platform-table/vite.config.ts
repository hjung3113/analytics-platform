import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { queryFixture } from './src/fixture/server';
export default defineConfig({
  plugins: [tailwindcss(), { name: 'synthetic-server', configureServer(server) {
    server.middlewares.use('/api/rows', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      try { res.end(JSON.stringify(queryFixture(new URL(req.url!, 'http://localhost').searchParams))); }
      catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid fixture query' })); }
    });
  } }],
  test: { include: ['tests/*.unit.test.ts'], environment: 'node' },
});
