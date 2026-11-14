import { describe, expect, it } from 'vitest';
import { validationDiagnosticInputSchema, validationDiagnosticListSchema, validationDiagnosticItemResponseSchema } from './validation-diagnostic.ts';
const input = { schemaVersion: 1, producer: 'synthetic', producerVersion: '1.0', inputManifestDigest: 'a'.repeat(64), items: [{ itemKey: 'synthetic:item', origin: 'analysis', title: 'Synthetic title' }] };
describe('validation diagnostic version 1', () => {
  it('accepts a document and rejects attachments, future versions and unknown fields', () => {
    expect(validationDiagnosticInputSchema.safeParse(input).success).toBe(true);
    expect(validationDiagnosticInputSchema.safeParse({ ...input, items: [{ ...input.items[0], title: '😀'.repeat(200) }] }).success).toBe(true);
    for (const extra of [{ schemaVersion: 2 }, { attachments: [] }, { verdict: 'PASS' }]) expect(validationDiagnosticInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  it('requires ruleId for rule-origin items', () => {
    expect(validationDiagnosticInputSchema.safeParse({ ...input, items: [{ ...input.items[0], origin: 'rule' }] }).success).toBe(false);
    expect(validationDiagnosticInputSchema.safeParse({ ...input, items: [{ ...input.items[0], origin: 'rule', ruleId: 'R1' }] }).success).toBe(true);
  });
  it('represents metadata-only lists and erased bodies with null Source text', () => {
    expect(validationDiagnosticListSchema.safeParse({ access: 'no_permission', documents: [], rows: [], total: 0 }).success).toBe(true);
    expect(validationDiagnosticItemResponseSchema.safeParse({ item: { producer: 'synthetic', itemKey: 'synthetic:item', origin: 'analysis', ruleResultId: null, title: null, explanation: null, evidenceRefs: [], bodyState: 'erased_admin', tables: [{ tableKey: 'data', title: null, columns: [{ key: 'value', label: null, type: 'string' }], totalRows: 1, rowOffset: 0, rows: [{ value: null }] }] } }).success).toBe(true);
  });
});
