import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { withTokenEvidenceSafety } from './token-evidence-safety.ts';

const source = readFileSync(new URL('./api-tokens.admin.real.spec.ts', import.meta.url), 'utf8');
test('the credential flow disables failure snapshots and recording, and never sends the value to a matcher (B1)', () => {
  assert.match(source, /process\.env\.PLAYWRIGHT_NO_COPY_PROMPT\s*=\s*['"]1['"]/);
  assert.match(source, /trace: 'off', screenshot: 'off', video: 'off'/);
  assert.doesNotMatch(source, /getByLabel\('토큰 값 · 한 번만 표시'\)\)\.toHaveValue/);
  assert.match(source, /secretIsValid/);
  assert.match(readFileSync(new URL('./token-evidence-safety.ts', import.meta.url), 'utf8'), /finally\s*\{/);
  assert.match(source, /page\.close\(/);
  assert.ok(source.indexOf("toContainText('폐기됨')") < source.indexOf('await evidence('));
});
const mock = readFileSync(new URL('../tests/api-tokens.spec.ts', import.meta.url), 'utf8');
test('mock menu assertions use the screen status and menu-level denial (B3)', () => {
  assert.doesNotMatch(mock, /expect\(page\.getByRole\('status'\)\)/);
  assert.match(mock, /이 메뉴에 대한 권한이 없습니다/);
});

test('a synthetic credential failure revokes and closes before any later evidence, with fixed safe diagnostics', async () => {
  const synthetic = `ap_12345678_${'S'.repeat(48)}`;
  const events: string[] = [];
  await assert.rejects(async () => {
    await withTokenEvidenceSafety(async () => { throw new Error(synthetic); }, async () => { events.push('revoke'); }, async () => { events.push('close'); });
    events.push('evidence');
  }, error => error instanceof Error && !error.message.includes(synthetic) && error.message.includes('diagnostics suppressed'));
  assert.deepEqual(events, ['revoke', 'close']);
});
