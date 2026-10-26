import { expect, it } from 'vitest';
import type { ConditionPreset } from '@ap/contracts';
import { activeConditionPreset } from '../condition-preset';

// Entry rule (ADR-0083 amendment, 06 §6.4): without a page value, the first preset covering every non-empty Condition axis.
const presets: ConditionPreset[] = [
  { id: 'eqp', label: { ko: '설비 기준', en: 'By equipment' }, axes: ['maker', 'model'] },
  { id: 'org', label: { ko: '조직 기준', en: 'By organization' }, axes: ['stgroup', 'team'] },
];
const menu = { conditionPresets: presets, conditionPreset: { key: 'view', default: 'eqp' } };
const idFor = (page: [string, string][], condition: Record<string, string[]> | null) => activeConditionPreset(menu, page, condition)?.id;

it.each([
  ['an org-only Condition enters the org preset', [], { stgroup: ['STG-PHOTO-A'] }, 'org'],
  ['a Condition no preset covers falls back to the default', [], { maker: ['TEL'], stgroup: ['STG-PHOTO-A'] }, 'eqp'],
  ['no Condition uses the default', [], null, 'eqp'],
  ['an empty axis array does not count', [], { maker: [], stgroup: ['STG-PHOTO-A'] }, 'org'],
  ['the first covering preset wins', [], { maker: ['TEL'] }, 'eqp'],
  ['an explicit key wins over the cover rule', [['view', 'org']], { maker: ['TEL'] }, 'org'],
  ['an unknown id falls through to the default, not the cover rule', [['view', 'zzz']], { stgroup: ['STG-PHOTO-A'] }, 'eqp'],
] as const)('%s', (_name, page, condition, expected) => {
  expect(idFor([...page] as [string, string][], condition as Record<string, string[]> | null)).toBe(expected);
});

it('is null for a menu without presets', () => {
  expect(activeConditionPreset({}, [], { maker: ['TEL'] })).toBeNull();
});
