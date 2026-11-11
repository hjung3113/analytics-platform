// Writes src/modules/eqv/domain/bundled-templates-data.ts from packages/eqv/assets/templates/*.template.json:
// one compact JSON string per Template id, ids sorted. Run: pnpm --filter @ap/platform-api gen:bundled-templates
// (`__tests__/bundled-templates.test.ts` fails with this command in its message when the copy differs from the assets).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = join(backendDir, '..', '..', 'packages', 'eqv', 'assets', 'templates');
const outfile = join(backendDir, 'src', 'modules', 'eqv', 'domain', 'bundled-templates-data.ts');

const SUFFIX = '.template.json';
const ids = readdirSync(assetDir).filter((name) => name.endsWith(SUFFIX)).map((name) => name.slice(0, -SUFFIX.length)).sort();
const entries = ids.map((id) => `  '${id}': ${JSON.stringify(JSON.stringify(JSON.parse(readFileSync(join(assetDir, id + SUFFIX), 'utf8'))))},`);

const header = [
  '// Generated copy of `packages/eqv/assets/templates/*.template.json` (the EV Templates the package ships, `BUNDLED_TEMPLATE_IDS`), one compact JSON string per id.',
  "// `@eqv/core` exports the ids but not the documents, and the server imports only `@eqv/core`; `__tests__/bundled-templates.test.ts` proves these strings equal the asset files",
  "// and the id list equals core's. Regenerate with `pnpm --filter @ap/platform-api gen:bundled-templates` when an asset changes; never edit by hand.",
];
writeFileSync(outfile, [...header, 'export const BUNDLED_TEMPLATE_JSON: Readonly<Record<string, string>> = {', ...entries, '};', ''].join('\n'));
