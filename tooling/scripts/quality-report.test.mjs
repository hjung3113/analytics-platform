import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyse, findCatchDefaults, findLocaleCalls, findStorageKeys, findStringUnions, isSourceFile, parse, parseArgs, toMarkdown } from './quality-report.mjs';

const sf = (text, file = 'a.ts') => parse(file, text);

test('isSourceFile keeps sources and drops tests, fixtures, stories, generated and declaration files', () => {
  assert.equal(isSourceFile('packages/sdk/ui/src/Button.tsx'), true);
  assert.equal(isSourceFile('tooling/scripts/check-lazy-chunks.mjs'), true);
  for (const file of [
    'packages/sdk/ui/src/Button.test.tsx',
    'packages/sdk/ui/src/__tests__/x.ts',
    'apps/platform-api/test/helpers.ts',
    'packages/x/src/__fixtures__/a.ts',
    'packages/sdk/ui/src/Button.stories.tsx',
    'packages/x/src/mock-data/cluster.generated.ts',
    'packages/x/src/env.d.ts',
    'apps/platform-e2e/src/flow.ts',
    'apps/platform-api/src/test-support/db.ts',
    'packages/x/src/testing.ts',
    'packages/x/src/modules/log/testing/engine.ts',
    'apps/platform-api/src/seed/catalog-fixtures.ts',
    'packages/sdk/ui/src/rich-content/fixtures-local.ts',
    'packages/x/vitest.config.ts',
    'packages/sdk/ui/src/vitest.setup.ts',
    'packages/x/scripts/endpoints.vitest.mjs',
    'tooling/storybook/src/views.tsx',
    'packages/sdk/ui/README.md',
  ]) {
    assert.equal(isSourceFile(file), false, file);
  }
});

test('findStringUnions keys a union by its sorted string members and ignores null/undefined and mixed unions', () => {
  const hits = findStringUnions(
    sf(
      `type A = 'b' | 'a';\nfunction f(x: 'a' | 'b' | undefined | null) {}\ntype Mixed = 'a' | number;\ntype One = 'a';\n` +
        `type P = Pick<T, 'a' | 'b'> & Omit<T, 'a' | 'b'>;\ntype E = Exclude<S, 'a' | 'b'> | Extract<S, 'a' | 'b'>;`,
    ),
  );
  assert.deepEqual(hits, [
    { key: "'a' | 'b'", line: 1, name: 'A' },
    { key: "'a' | 'b'", line: 2, name: undefined },
  ]);
});

test('analyse lists only union sets declared more than once', () => {
  const result = analyse(
    [
      { file: 'x.ts', text: `type S = 'idle' | 'ready';\ntype T = 'on' | 'off';` },
      { file: 'y.ts', text: `type Status = 'ready' | 'idle';` },
    ],
    new Set(['unions']),
  );
  assert.deepEqual(result.unions, [
    {
      members: "'idle' | 'ready'",
      sites: [
        { file: 'x.ts', line: 1, name: 'S' },
        { file: 'y.ts', line: 1, name: 'Status' },
      ],
    },
  ]);
});

test('findCatchDefaults reports default returns and empty handlers, not rethrows or computed results', () => {
  const hits = findCatchDefaults(
    sf(`
function a() { try { return read(); } catch { return []; } }
function b() { try { return read(); } catch (e) { log(e); return null; } }
function c() { try { return read(); } catch (e) { throw new Wrapped(e); } }
function d() { try { return read(); } catch (e) { return { ok: false, error: e }; } }
function e() { try { go(); } catch {} }
function f() { try { return read(); } catch { const g = () => { throw 1; }; return FALLBACK; } }
async function h() { try { await go(); } catch (e) { if (aborted) return; report(e); return; } }
function i() { try { go(); } catch { return; } }
function j() { try { return read(); } catch { return undefined; } }
load().catch(() => undefined);
load().catch(() => {});
load().catch((e) => report(e));
`),
  );
  assert.deepEqual(
    hits.map((h) => [h.line, h.form, h.kind, h.value]),
    [
      [2, 'catch', 'returns', '[]'],
      [3, 'catch', 'returns', 'null'],
      [6, 'catch', 'swallows', 'empty'],
      [7, 'catch', 'returns', 'FALLBACK'],
      [9, 'catch', 'swallows', 'empty'],
      [10, 'catch', 'returns', 'undefined'],
      [11, '.catch()', 'returns', 'undefined'],
      [12, '.catch()', 'swallows', 'empty'],
    ],
  );
});

test('findStorageKeys resolves literal, template, const, const-object and same-file key-builder keys', () => {
  const hits = findStorageKeys(
    sf(`
const KEY = 'platform:lang';
const KEYS = { view: 'ap.view' } as const;
const PREFIX = 'draft';
const v2Key = (userId: string) => \`platform:board:v2:\${userId}\`;
function lastKey(id: string) { return \`\${PREFIX}:\${id}\`; }
const groupsKey = () => 'platform:groups:v1:' + tuple();
localStorage.getItem(KEY);
window.sessionStorage.setItem(\`ap:\${id}\`, v);
this.storage.removeItem(KEYS.view);
store.getItem(v2Key(user));
storage.getItem(lastKey(id));
storage.getItem(makeKey(id));
writePreference(TABLE_SIZE_KEY, size);
readBrowserPreference(browserPreferenceKey('columns', user), options);
storage.getItem(groupsKey());
function read(key: string) { return localStorage.getItem(key); }
map.get('not-storage');
`),
  );
  assert.deepEqual(
    hits.map((h) => [h.line, h.method, h.key, h.resolved]),
    [
      [8, 'getItem', 'platform:lang', true],
      [9, 'setItem', 'ap:${id}', true],
      [10, 'removeItem', 'ap.view', true],
      [11, 'getItem', 'platform:board:v2:${userId}', true],
      [12, 'getItem', 'draft:${id}', true],
      [13, 'getItem', 'makeKey(id)', false],
      [14, 'writePreference', 'TABLE_SIZE_KEY', false],
      [15, 'readBrowserPreference', "browserPreferenceKey('columns', user)", false],
      [15, 'browserPreferenceKey', 'columns', true],
      [16, 'getItem', 'platform:groups:v1:${tuple()}', true],
      [17, 'getItem', 'key', false],
    ],
  );
});

test('findStorageKeys lists a same-file wrapper by its callers and keeps the inner call of a wrapper with none', () => {
  const hits = findStorageKeys(
    sf(`
const TABLE_SIZE_KEY = 'platform:table-size';
const sizeKey = (userId?: string) => (userId ? \`\${TABLE_SIZE_KEY}:\${userId}\` : TABLE_SIZE_KEY);
const readLocal = (key: string) => readLocalStorage(key, decode, 'normal');
function readJson(store: Storage, key: string) { return store.getItem(key); }
function load(userId: string) {
  const localKey = sizeKey(userId);
  readLocal(localKey);
  readJson(localStorage, \`platform:favorites:\${userId}\`);
}
export function readExported(name: string) { return sessionStorage.getItem(name); }
function shadow(name: string) { for (const [k] of rows) use(k); return localStorage.getItem(name); }
const name = 'not-this';
`),
  );
  assert.deepEqual(
    hits.map((h) => [h.line, h.method, h.key, h.resolved]),
    [
      [8, 'readLocal', 'platform:table-size:${userId} | platform:table-size', true],
      [9, 'readJson', 'platform:favorites:${userId}', true],
      [11, 'getItem', 'name', false],
      [12, 'getItem', 'name', false],
    ],
  );
});

test('parseArgs needs a path after --out and known ids after --only', () => {
  assert.equal(parseArgs(['--out', 'r.md']).out, 'r.md');
  assert.throws(() => parseArgs(['--out']), /--out takes a file path/);
  assert.throws(() => parseArgs(['--out', '--json']), /--out takes a file path/);
  assert.throws(() => parseArgs(['--only', 'bogus']), /--only takes/);
  assert.deepEqual([...parseArgs(['--only', 'locale,unions']).only], ['locale', 'unions']);
});

test('findLocaleCalls finds every toLocale* call', () => {
  const hits = findLocaleCalls(sf(`d.toLocaleDateString('ko-KR');\nname.toLocaleLowerCase();\nn.toFixed(2);`));
  assert.deepEqual(hits, [
    { line: 1, method: 'toLocaleDateString' },
    { line: 2, method: 'toLocaleLowerCase' },
  ]);
});

test('long-files counts lines and toMarkdown cites path:line rows', () => {
  const long = `${'x;\n'.repeat(501)}`;
  const result = analyse(
    [
      { file: 'big.ts', text: long },
      { file: 'small.ts', text: 'x;\n'.repeat(500) },
      { file: 'l.ts', text: 'a.toLocaleString();\n' },
    ],
    new Set(['long-files', 'locale']),
  );
  assert.deepEqual(result['long-files'], [{ file: 'big.ts', lines: 501 }]);
  const md = toMarkdown(result, { commit: 'abc1234', date: '2026-11-28', files: 3 });
  assert.match(md, /^## locale — `toLocale\*` calls \(1\)$/m);
  assert.match(md, /^- `l\.ts:1` toLocaleString$/m);
  assert.match(md, /^- `big\.ts` 501 lines$/m);
  assert.doesNotMatch(md, /## unions/);
});
