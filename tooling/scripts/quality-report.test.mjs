import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyse, findCatchDefaults, findLocaleCalls, findStorageKeys, findStringUnions, isSourceFile, parse, toMarkdown } from './quality-report.mjs';

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
    'packages/sdk/ui/README.md',
  ]) {
    assert.equal(isSourceFile(file), false, file);
  }
});

test('findStringUnions keys a union by its sorted string members and ignores null/undefined and mixed unions', () => {
  const hits = findStringUnions(
    sf(`type A = 'b' | 'a';\nfunction f(x: 'a' | 'b' | undefined | null) {}\ntype Mixed = 'a' | number;\ntype One = 'a';`),
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
      [8, '.catch()', 'returns', 'undefined'],
      [9, '.catch()', 'swallows', 'empty'],
    ],
  );
});

test('findStorageKeys resolves literal, template, same-file const and const-object keys', () => {
  const hits = findStorageKeys(
    sf(`
const KEY = 'platform:lang';
const KEYS = { view: 'ap.view' } as const;
localStorage.getItem(KEY);
window.sessionStorage.setItem(\`ap:\${id}\`, v);
this.storage.removeItem(KEYS.view);
storage.getItem(makeKey(id));
map.get('not-storage');
`),
  );
  assert.deepEqual(
    hits.map((h) => [h.line, h.method, h.key, h.resolved]),
    [
      [4, 'getItem', 'platform:lang', true],
      [5, 'setItem', 'ap:${id}', true],
      [6, 'removeItem', 'ap.view', true],
      [7, 'getItem', 'makeKey(id)', false],
    ],
  );
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
