import { expect, it } from 'vitest';
import { AUDIT_TYPE_TOKEN, MENU_ID_PATTERN, invalidFilterText } from '@ap/contracts';

it.each(['', 'x\n', 'x\r', 'x y', 'x?y', 'x#y', 'x&y', 'x'.repeat(81), null, 1])('rejects invalid filter text %j (FEA-12)', value => {
  expect(invalidFilterText(value)).toBe(true);
});
it.each(['x', 'x'.repeat(80), '합성', 'x/y', 'x=y', 'x\u0000'])('preserves existing valid filter text %j (FEA-12)', value => {
  expect(invalidFilterText(value)).toBe(false);
});
it('keeps opaque audit types separate from menu-id syntax (FEA-12)', () => {
  expect(AUDIT_TYPE_TOKEN.test('Synthetic.Type:v2-x')).toBe(true);
  expect(AUDIT_TYPE_TOKEN.test('1synthetic')).toBe(false);
  expect(MENU_ID_PATTERN.test('synthetic-menu')).toBe(true);
  expect(MENU_ID_PATTERN.test('synthetic/menu')).toBe(false);
  expect(MENU_ID_PATTERN.test('synthetic\u0000')).toBe(false);
});
