// @vitest-environment node

import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

// #2951: the SDK's development-only warnings and checks must leave a Vite production application bundle. The old check read
// `import.meta` passed as a value, which Vite does not replace, so these strings (and the dev-only throw in table export)
// shipped and ran in production.
const ENTRY = '\0sdk-dev-checks-entry';
const ENTRY_SOURCE = `
import { DetailPanelSlotProvider } from '@ap/ui';
import { Inspector, PanelWorkspace, PlatformDataTable, useWorkbookExport } from '@ap/components';
import { useDrill } from '@ap/kernel';
globalThis.__sdkDevChecks = [DetailPanelSlotProvider, Inspector, PanelWorkspace, PlatformDataTable, useWorkbookExport, useDrill];
`;

const DEV_ONLY = [
  ['DetailPanelSlot overlap warning', 'Multiple registrants; the last registrant wins'],
  ['Inspector dev checks', '[Inspector] '],
  ['PanelWorkspace dev checks', 'exactly one panel must be primary'],
  ['PanelWorkspace reveal warning', 'which is not a panel'],
  ['PlatformDataTable rows-source warning', 'are ignored with `rows` and `externalPagination`'],
  ['table export dev throw (production exports an empty cell)', 'give it exportValue'],
  ['kernel drill value label warning', 'showing the raw value'],
] as const;

async function productionBundle(): Promise<string> {
  // `vite build` replaces `process.env.NODE_ENV` with the build process's value; vitest sets it to `test`, a real build to
  // `production`.
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return await bundle();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

async function bundle(): Promise<string> {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    root: fileURLToPath(new URL('../..', import.meta.url)),
    mode: 'production',
    plugins: [{ name: 'sdk-dev-checks-entry', resolveId: id => (id === ENTRY ? id : null), load: id => (id === ENTRY ? ENTRY_SOURCE : null) }],
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: ENTRY,
        // Only the SDK sources matter here; third-party packages stay out so the build is quick.
        external: id => !id.startsWith('@ap/') && !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0'),
      },
    },
  });
  const results = (Array.isArray(output) ? output : [output]) as Rollup.RollupOutput[];
  return results.flatMap(result => result.output).map(file => (file.type === 'chunk' ? file.code : '')).join('\n');
}

describe('SDK development-only checks in a Vite production bundle (#2951)', () => {
  it('drops every development-only warning and throw', async () => {
    const code = await productionBundle();
    expect(code).toContain('globalThis.__sdkDevChecks');
    expect(DEV_ONLY.filter(([, marker]) => code.includes(marker)).map(([site]) => site)).toEqual([]);
  }, 120_000);
});
