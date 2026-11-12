import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { createMockAdapter, defineMockEndpoint, setRole } from '@ap/mock-server';
import { axes, endpoint, menu, permissions } from './contract';

const equipment = [
  { id: 'kit-e1', 'chamberType': 'A', 'team': 'A', value: 1 },
  { id: 'kit-e2', 'chamberType': 'A', 'team': 'B', value: 2 },
  { id: 'kit-e3', 'chamberType': 'B', 'team': 'A', value: 3 },
];
const facts = equipment.flatMap((item) => ['old', 'new'].map((condition) => ({ ...item, condition })));

// A real mock endpoint at an HTTP boundary lets Playwright hold the response in flight.
const adapter = createMockAdapter({ registry: { menus: [menu] }, equipmentAxes: axes, permissions, latency: 0, endpoints: [
  defineMockEndpoint(endpoint, {
    source: 'kit-round-trip', metricVersion: () => 'kit-v1',
    validate: ({ params }) => axes.some((axis) => axis.id === params.axis) && ['all', 'old', 'new'].includes(params.filter) ? null : 'Invalid kit condition',
    handle: ({ params }) => {
      const groups = new Map<string, number>();
      for (const fact of facts.filter((item) => params.filter === 'all' || item.condition === params.filter)) {
        const group = fact[params.axis as 'chamberType' | 'team'];
        groups.set(group, (groups.get(group) ?? 0) + fact.value);
      }
      return {
        rows: [...groups].map(([suffix, value]) => ({ group: `${params.axis}-${suffix}`, name: `${params.filter}-${suffix}`, value })),
        measure: { unit: 'count', reaggregation: 'sum', metricVersion: 'kit-v1' },
      };
    },
  }),
] });
setRole('engineer');

export default defineConfig({
  plugins: [tailwindcss(), {
    name: 'round-trip-mock',
    configureServer(server) {
      server.middlewares.use('/api/round-trip', (request, response) => {
        if (request.method !== 'POST') { response.writeHead(405).end(); return; }
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => {
          void (async () => {
            try {
              const result = await adapter.menuQuery(JSON.parse(body));
              response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
            } catch {
              response.writeHead(400).end();
            }
          })();
        });
      });
    },
  }],
});
