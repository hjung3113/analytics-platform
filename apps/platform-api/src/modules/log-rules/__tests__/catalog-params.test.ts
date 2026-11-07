import { describe, expect, it } from 'vitest';

import {
  parseCatalogStatusParams,
  parseRuleDetailParams,
  parseRuleParams,
  parseRuleSetDetailParams,
  parseRuleSetParams,
} from '../domain/catalog-params.js';

const refused = (r: { ok: boolean }) => expect(r.ok).toBe(false);

describe('rules params', () => {
  it('defaults: first page of 50, sorted by RuleSet key, no filter, no target search', () => {
    const r = parseRuleParams({});
    expect(r).toMatchObject({ ok: true, value: { page: 0, pageSize: 50, q: null, targetQ: null, sorting: [{ id: 'ruleSetKey', desc: false }] } });
  });

  it.each([
    ['an unknown sort key', { sorting: [{ id: 'title; drop table', desc: false }] }],
    ['an unknown filter field', { filters: [{ id: 'ruleBody', op: 'in', value: ['x'] }] }],
    ['an unsupported operator', { filters: [{ id: 'support', op: 'isEmpty' }] }],
    ['a support value outside the enum', { filters: [{ id: 'support', op: 'in', value: ['great'] }] }],
    ['a presence filter with a value', { filters: [{ id: 'requirementIds', op: 'isNotEmpty', value: ['x'] }] }],
    ['a page size over the cap', { pageSize: 201 }],
    ['a target search that is not a string', { targetQ: 5 }],
    ['a too long target search', { targetQ: 'a'.repeat(201) }],
    ['a NUL in the target search', { targetQ: 'a\u0000b' }],
  ])('refuses %s', (_name, params) => refused(parseRuleParams(params)));

  it('accepts support / scope / requirementIds / ruleSetKey filters and keeps a blank target search as none', () => {
    const r = parseRuleParams({
      targetQ: '  ',
      filters: [
        { id: 'support', op: 'in', value: ['supported', 'partial'] },
        { id: 'scope', op: 'isNotEmpty' },
        { id: 'requirementIds', op: 'isEmpty' },
        { id: 'ruleSetKey', op: 'notIn', value: ['rs'] },
      ],
    });
    expect(r).toMatchObject({ ok: true, value: { targetQ: null } });
  });

  it('keeps a target search verbatim (no trimming, no parsing)', () => {
    expect(parseRuleParams({ targetQ: ' Mod/Ev ' })).toMatchObject({ ok: true, value: { targetQ: ' Mod/Ev ' } });
  });
});

describe('ruleSets params', () => {
  it.each([
    ['an unknown sort key', { sorting: [{ id: 'support', desc: false }] }],
    ['an unknown filter field', { filters: [{ id: 'support', op: 'in', value: ['supported'] }] }],
  ])('refuses %s', (_name, params) => refused(parseRuleSetParams(params)));
  it('accepts a source filter', () => {
    expect(parseRuleSetParams({ filters: [{ id: 'sourceSystem', op: 'in', value: ['v'] }] }).ok).toBe(true);
  });
});

describe('detail params', () => {
  it.each([[{}], [{ ruleSetKey: '' }], [{ ruleSetKey: 5 }], [{ ruleSetKey: ' rs' }], [{ ruleSetKey: 'a\tb' }], [{ ruleSetKey: 'x'.repeat(201) }]])(
    'refuses a bad ruleSetKey %j',
    (params) => refused(parseRuleSetDetailParams(params)),
  );
  it('needs both keys for a Rule and compares them exactly', () => {
    refused(parseRuleDetailParams({ ruleSetKey: 'rs' }));
    expect(parseRuleDetailParams({ ruleSetKey: 'rs', ruleKey: 'Rule A' })).toEqual({ ok: true, value: { ruleSetKey: 'rs', ruleKey: 'Rule A' } });
  });
  it('catalogStatus takes no params', () => {
    expect(parseCatalogStatusParams({})).toEqual({ ok: true });
  });
});
