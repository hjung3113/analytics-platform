import type { Plugin, Rollup } from 'vite';

/** The injection specifier main.tsx imports (src/platform-assembly.d.ts) — the one definition (#153). */
export const ASSEMBLY_SPECIFIER = '#platform-assembly';

/**
 * Production-graph rules (#153, ADR-0009): module ids that must never be bundled into a production build.
 * Pure so it can be unit-tested; scripts/check-prod-graph.ts feeds it the Rollup output.
 */
const FORBIDDEN: { label: string; test: (id: string) => boolean }[] = [
  { label: 'packages/mock-server/', test: id => id.includes('/packages/mock-server/') },
  { label: '@ap/mock-server', test: id => /(^|\/)@ap\/mock-server(\/|$)/.test(id) },
  { label: 'menus/*/src/mock/', test: id => /\/menus\/[^/]+\/src\/mock\//.test(id) },
  { label: 'apps/platform-web/src/dev/', test: id => id.includes('/apps/platform-web/src/dev/') },
];

/** Offending ids with the rule each one broke; Windows separators are normalised first. */
export function findForbiddenModules(ids: Iterable<string>): { id: string; rule: string }[] {
  const out: { id: string; rule: string }[] = [];
  for (const raw of ids) {
    const id = raw.replaceAll('\\', '/');
    const hit = FORBIDDEN.find(f => f.test(id));
    if (hit) out.push({ id: raw, rule: hit.label });
  }
  return out;
}

/**
 * Build-time guard (#153 review P2-1): every non-mock build checks its own full graph — the real assembly included —
 * and fails listing the offenders. vite.config.ts adds it; it cannot be skipped by a flag.
 */
export function prodGraphGuard(): Plugin {
  return {
    name: 'ap:prod-graph-guard',
    apply: 'build',
    generateBundle(_options, bundle) {
      const ids = Object.values(bundle).flatMap(c => (c.type === 'chunk' ? (c as Rollup.OutputChunk).moduleIds : []));
      const offenders = findForbiddenModules(ids);
      if (offenders.length > 0) {
        this.error(`production build bundles mock/dev code (ADR-0009):\n${offenders.map(o => `  - [${o.rule}] ${o.id}`).join('\n')}`);
      }
    },
  };
}
