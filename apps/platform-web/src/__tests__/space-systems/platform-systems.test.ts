// Freshness gate for platform-systems.json (#1289 node i, ADR-0110 decision 5): the business systems whose spaces
// declare `feedbackTracking`, generated from the app Registry's SPACES and committed. The backend image copies the file
// and registers one Managed System per entry at startup. `pnpm gen:platform-systems` rewrites it.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The one schema the backend also parses (#1289 node i); this test is the only platform-web reader of the feature package.
// eslint-disable-next-line no-restricted-imports -- shared file schema: the generator test and the server must parse the same shape
import { platformSystemsFileSchema, type PlatformSystemsFile } from '@ap/feature-shared';
import { describe, expect, it } from 'vitest';
import { SPACES } from '../../menus';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../platform-systems.json');
const REGENERATE = 'pnpm gen:platform-systems';

interface DeclaringSpace { id: string; label: { ko: string }; feedbackTracking?: true }

function buildPlatformSystemsFile(spaces: readonly DeclaringSpace[]): PlatformSystemsFile {
  const systems = spaces
    .filter(space => space.feedbackTracking === true)
    .map(space => ({ space_id: String(space.id), name: space.label.ko }))
    .sort((a, b) => (a.space_id < b.space_id ? -1 : a.space_id > b.space_id ? 1 : 0));
  return { version: 1, systems };
}

const render = (file: PlatformSystemsFile): string => `${JSON.stringify(file, null, 2)}\n`;

describe('platform-systems.json', () => {
  it('lists the feedbackTracking spaces sorted by space_id, named by their Korean label', () => {
    const file = buildPlatformSystemsFile([
      { id: 'b', label: { ko: '비' }, feedbackTracking: true },
      { id: 'skip', label: { ko: '제외' } },
      { id: 'a', label: { ko: '에이' }, feedbackTracking: true },
    ]);
    expect(file).toEqual({ version: 1, systems: [{ space_id: 'a', name: '에이' }, { space_id: 'b', name: '비' }] });
  });

  it('matches the app Registry declarations (regenerate with UPDATE_PLATFORM_SYSTEMS=1 or `pnpm gen:platform-systems`)', () => {
    const expected = render(buildPlatformSystemsFile(SPACES));
    if (process.env.UPDATE_PLATFORM_SYSTEMS === '1') writeFileSync(FILE, expected);
    const actual = readFileSync(FILE, 'utf8');
    expect(actual, `platform-systems.json is stale; run \`${REGENERATE}\``).toBe(expected);
  });

  it('is stale when a declaration changes without regenerating', () => {
    const committed = readFileSync(FILE, 'utf8');
    const changed = render(buildPlatformSystemsFile([...SPACES, { id: 'extra', label: { ko: '추가' }, feedbackTracking: true }]));
    expect(changed).not.toBe(committed);
  });

  it('parses with the schema the backend reads', () => {
    const parsed = platformSystemsFileSchema.safeParse(JSON.parse(readFileSync(FILE, 'utf8')));
    expect(parsed.success).toBe(true);
  });
});
