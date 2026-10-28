// Snapshot of every menu endpoint declaration: `endpoints.json`, validated through `endpointDeclarationSchema` (ADR-0096).
// Menu `src/endpoints.ts` files import './permission' and '@ap/contracts', which Node cannot resolve, so Vite loads them here.
// This is not part of the package `test`: turbo would cache it without seeing menu edits. The root `pnpm sdk:test`
// (tooling/sdk/sdk-schemas.test.mjs) runs it; regenerate with `pnpm --filter @ap/contract-schemas gen:endpoints`.
//
// Only `menus/*/*/src/endpoints.ts` and `platform/*/src/endpoints.ts` count: external module endpoints (@eqv/*) and the mock assembly are out of scope here.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endpointDeclarationSchema } from '../src/index.ts';

const target = new URL('../endpoints.json', import.meta.url);
const modules = import.meta.glob(['../../../../menus/*/*/src/endpoints.ts', '../../../../platform/*/src/endpoints.ts'], { eager: true });

const isDeclaration = (value) =>
  value !== null && typeof value === 'object' && typeof value.id === 'string' && typeof value.menuId === 'string' && value.paramKeys !== null && typeof value.paramKeys === 'object';

/** An export is a declaration, or a plain object whose values are (the `hwTime = { levelRows, … }` shape). */
function* declarationsIn(value) {
  if (isDeclaration(value)) yield value;
  else if (value !== null && typeof value === 'object' && !Array.isArray(value)) for (const inner of Object.values(value)) if (isDeclaration(inner)) yield inner;
}

function collect() {
  const found = [];
  for (const [file, exports] of Object.entries(modules)) {
    for (const [name, value] of Object.entries(exports)) {
      for (const spec of declarationsIn(value)) found.push({ file, name, spec });
    }
  }
  const ids = new Set();
  for (const { file, name, spec } of found) {
    if (ids.has(spec.id)) throw new Error(`duplicate endpoint id "${spec.id}" (${file} ${name})`);
    ids.add(spec.id);
  }
  return found
    .map(({ file, name, spec }) => {
      // `_types` is phantom; `paramKeys` becomes the key list. Key order follows the schema, not the menu's object literal.
      const { _types, paramKeys, ...rest } = spec;
      const parsed = endpointDeclarationSchema.safeParse({ ...rest, paramKeys: Object.keys(paramKeys) });
      if (!parsed.success) throw new Error(`${file} ${name} (${spec.id}) does not fit endpointDeclarationSchema: ${parsed.error.message}`);
      return parsed.data;
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

describe('endpoints.json', () => {
  it('lists every menu endpoint declaration, sorted by id', () => {
    const declarations = collect();
    expect(declarations.length).toBeGreaterThan(0);
    const text = `${JSON.stringify(declarations, null, 2)}\n`;
    if (process.env.UPDATE_ENDPOINTS === '1') {
      writeFileSync(target, text);
      return;
    }
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      // A missing file reports as out of date below.
    }
    expect(current === text, 'endpoints.json is out of date with the menu declarations — run `pnpm --filter @ap/contract-schemas gen:endpoints` and commit it').toBe(true);
  });
});
