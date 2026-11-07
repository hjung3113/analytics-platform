import { describe, expect, it } from 'vitest';

import {
  VALIDATION_CATALOG_REPORT_LIMITS,
  catalogIdentifierSchema,
  toJsonSchema,
  validationCatalogReportResponseSchema,
  validationCatalogReportSchema,
} from './index.ts';

const rule = { ruleKey: 'r1', title: 'T', summary: 'S', support: 'supported' };
const report = (over: Record<string, unknown> = {}) => ({
  sourceSystem: 'validator',
  validatorVersion: '1.0',
  ruleSets: [{ ruleSetKey: 'rs', revision: '1', status: 'active', rules: [rule] }],
  ...over,
});

describe('validation catalog report v0', () => {
  it('accepts a full report', () => {
    const full = report({
      ruleSets: [
        {
          ruleSetKey: 'rs',
          revision: '2',
          resultRef: 'rs@2',
          status: 'retired',
          supersedes: '1',
          rules: [
            {
              ...rule,
              scope: { logTypes: ['a'], softwareRange: '>=1' },
              requiredDefault: true,
              targets: [{ format: 'xpath', target: '//a', requirementIds: ['mod/ev'] }],
            },
          ],
        },
      ],
    });
    expect(validationCatalogReportSchema.safeParse(full).success).toBe(true);
  });

  it.each([
    ['top-level key', report({ extra: 1 })],
    ['rule set key', report({ ruleSets: [{ ruleSetKey: 'a', revision: '1', status: 'active', rules: [], body: 'x' }] })],
    ['rule body field', report({ ruleSets: [{ ruleSetKey: 'a', revision: '1', status: 'active', rules: [{ ...rule, condition: 'x > 1' }] }] })],
    ['scope key', report({ ruleSets: [{ ruleSetKey: 'a', revision: '1', status: 'active', rules: [{ ...rule, scope: { script: 'x' } }] }] })],
    ['target key', report({ ruleSets: [{ ruleSetKey: 'a', revision: '1', status: 'active', rules: [{ ...rule, targets: [{ format: 'f', target: 't', threshold: 1 }] }] }] })],
  ])('refuses an unknown %s', (_n, input) => {
    expect(validationCatalogReportSchema.safeParse(input).success).toBe(false);
  });

  it.each([' a', 'a ', '', 'a\nb', 'a\u0000', 'x'.repeat(201)])('refuses identifier %j', (v) => {
    expect(catalogIdentifierSchema.safeParse(v).success).toBe(false);
  });
  it('keeps inner spaces and case', () => {
    expect(catalogIdentifierSchema.safeParse('Rule Set 1').success).toBe(true);
  });

  it.each([
    ['support', { ...rule, support: 'maybe' }],
    ['title length', { ...rule, title: 'x'.repeat(VALIDATION_CATALOG_REPORT_LIMITS.title + 1) }],
    ['targets count', { ...rule, targets: Array.from({ length: 21 }, () => ({ format: 'f', target: 't' })) }],
  ])('refuses a bad %s', (_n, bad) => {
    const input = report({ ruleSets: [{ ruleSetKey: 'a', revision: '1', status: 'active', rules: [bad] }] });
    expect(validationCatalogReportSchema.safeParse(input).success).toBe(false);
  });

  it('closes the response and exports a closed JSON Schema', () => {
    expect(validationCatalogReportResponseSchema.safeParse({ reportId: '4b0f1a52-7c1e-4f0a-9d5e-3a1b2c3d4e5f', outcome: 'accepted', replayed: false, current: true }).success).toBe(true);
    expect(validationCatalogReportResponseSchema.safeParse({ reportId: 'x', outcome: 'accepted', replayed: false, current: true }).success).toBe(false);
    expect(toJsonSchema(validationCatalogReportSchema)).toMatchObject({ additionalProperties: false });
  });
});
