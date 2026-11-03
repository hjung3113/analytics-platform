import { describe, expect, it } from 'vitest';

import {
  type CatalogRef,
  type CatalogSnapshot,
  type ModelRef,
  type PlanInput,
  normalizeRow,
  planRows,
  statusAfterValidate,
} from '../domain/import-plan.js';
import { toCodeKey } from '../domain/code-key.js';

const ref = (id: string, name: string, active = true, rowVersion = 3): CatalogRef => ({ id, name, active, rowVersion });
const model = (id: string, name: string, processIds: string[] = [], active = true): ModelRef => ({ ...ref(id, name, active), processIds: new Set(processIds) });
const snapshot = (over: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  vendors: new Map([
    ['ACME', ref('v-acme', 'Acme')],
    ['OLD', ref('v-old', 'Old', false)],
    ['OTHER', ref('v-other', 'Other')],
  ]),
  processes: new Map([
    ['ETCH', ref('p-etch', 'Etch')],
    ['CLEAN', ref('p-clean', 'Clean')],
    ['DEAD', ref('p-dead', 'Dead', false)],
  ]),
  models: new Map([
    ['v-acme|X1', model('m-x1', 'X one', ['p-etch'])],
    ['v-acme|GONE', model('m-gone', 'Gone', [], false)],
    ['v-other|X1', model('m-other-x1', 'Other X one')],
  ]),
  softwares: new Map([
    ['m-x1|1.0', ref('s-10', 'Release one')],
    ['m-x1|0.9', ref('s-09', 'Old rel', false)],
  ]),
  ...over,
});

const map = {
  vendor: { vendor_code: 'c', vendor_name: 'n' },
  model: { vendor_code: 'v', model_code: 'c', model_name: 'n', process_codes: 'p' },
  software: { vendor_code: 'v', model_code: 'm', version_key: 'k', version_name: 'n' },
};

function plan(entity: 'vendor' | 'model' | 'software', raws: Record<string, string>[], mapping: Record<string, string>, catalog = snapshot()) {
  const inputs: PlanInput[] = raws.map((raw, i) => {
    const { normalized, errors } = normalizeRow(entity, raw, mapping);
    return { rowNo: i + 1, normalized, errors };
  });
  return planRows(entity, inputs, catalog);
}

describe('normalizeRow', () => {
  it('trims names, keeps the typed code and derives the ADR-0107 key', () => {
    const { normalized, errors } = normalizeRow('vendor', { c: '  ac  me ', n: '  Acme  ' }, map.vendor);
    expect(errors).toEqual([]);
    expect(normalized).toEqual({ code: 'ac  me', codeKey: toCodeKey('ac  me'), name: 'Acme' });
    expect((normalized as { codeKey: string }).codeKey).toBe('AC ME');
  });

  it('splits process_codes on ; and , and reports blank, too long and repeated codes', () => {
    const ok = normalizeRow('model', { v: 'acme', c: 'x1', n: 'X', p: 'etch; clean ,' }, map.model);
    expect(ok.errors).toEqual([]);
    expect(ok.normalized).toMatchObject({ processCodes: ['etch', 'clean'], processKeys: ['ETCH', 'CLEAN'], processesMapped: true });
    expect(normalizeRow('model', { v: 'acme', c: 'x1', n: 'X', p: 'etch;ETCH' }, map.model).errors).toEqual([{ field: 'process_codes', code: 'duplicate' }]);
    expect(normalizeRow('model', { v: '', c: '', n: '', p: '' }, map.model).errors.map((e) => `${e.field}/${e.code}`)).toEqual([
      'vendor_code/required',
      'model_code/required',
      'model_name/required',
    ]);
    expect(normalizeRow('vendor', { c: 'x'.repeat(65), n: 'n' }, map.vendor).errors).toEqual([{ field: 'vendor_code', code: 'too_long' }]);
  });

  it('allows a blank software name', () => {
    expect(normalizeRow('software', { v: 'acme', m: 'x1', k: '1.0', n: '' }, map.software).errors).toEqual([]);
  });
});

describe('planRows: vendor', () => {
  it.each([
    ['new', { c: 'fresh', n: 'Fresh' }, 'new'],
    ['unchanged (key match, same name)', { c: 'acme', n: 'Acme' }, 'unchanged'],
    ['update (same key, other name)', { c: 'ACME', n: 'Acme Corp' }, 'update'],
    ['conflict (inactive row keeps its key)', { c: 'old', n: 'Old' }, 'conflict'],
  ])('%s', (_label, raw, state) => {
    const [r] = plan('vendor', [raw], map.vendor);
    expect(r?.planState).toBe(state);
    if (state !== 'new') expect(r?.targetVersion).toBe(3);
    else expect(r?.targetId).toBeNull();
  });

  it('flags a repeated key in the file on the later row', () => {
    const rows = plan('vendor', [{ c: 'a1', n: 'A' }, { c: ' A1 ', n: 'B' }], map.vendor);
    expect(rows.map((r) => r.planState)).toEqual(['new', 'error']);
    expect(rows[1]?.errors).toEqual([{ field: 'vendor_code', code: 'duplicate_in_file' }]);
  });
});

describe('planRows: model', () => {
  it('is new when the code is absent under the resolved vendor, even if another vendor has it (no vendor move)', () => {
    const [r] = plan('model', [{ v: 'old', c: 'x1', n: 'N', p: '' }], map.model);
    // `old` vendor is inactive and has no X1: parent_inactive, still never a move of the Acme/Other X1
    expect(r?.errors).toEqual([{ field: 'vendor_code', code: 'parent_inactive' }]);
    const [s] = plan('model', [{ v: 'other', c: 'x1', n: 'Other X one', p: '' }], map.model);
    expect(s?.planState).toBe('unchanged');
    expect(s?.targetId).toBe('m-other-x1');
    const catalog = snapshot({ models: new Map([['v-acme|X1', model('m-x1', 'X one')]]) });
    const [t] = plan('model', [{ v: 'other', c: 'x1', n: 'N', p: '' }], map.model, catalog);
    expect(t?.planState).toBe('new');
    expect(t?.targetId).toBeNull();
  });

  it('keeps the same code under two vendors distinct inside one file', () => {
    const rows = plan('model', [{ v: 'acme', c: 'x1', n: 'X one', p: 'etch' }, { v: 'other', c: 'x1', n: 'Other X one', p: '' }], map.model);
    expect(rows.map((r) => r.planState)).toEqual(['unchanged', 'unchanged']);
  });

  it('errors parent_missing for an unknown vendor and flags a repeated vendor+code', () => {
    expect(plan('model', [{ v: 'nobody', c: 'x1', n: 'N', p: '' }], map.model)[0]?.errors).toEqual([{ field: 'vendor_code', code: 'parent_missing' }]);
    const rows = plan('model', [{ v: 'acme', c: 'n1', n: 'N', p: '' }, { v: 'ACME', c: 'N1', n: 'N', p: '' }], map.model);
    expect(rows.map((r) => r.planState)).toEqual(['new', 'error']);
    expect(rows[1]?.errors).toEqual([{ field: 'model_code', code: 'duplicate_in_file' }]);
  });

  it('is conflict for an inactive model and update when the name or the process set differs', () => {
    expect(plan('model', [{ v: 'acme', c: 'gone', n: 'Gone', p: '' }], map.model)[0]?.planState).toBe('conflict');
    expect(plan('model', [{ v: 'acme', c: 'x1', n: 'Renamed', p: 'etch' }], map.model)[0]?.planState).toBe('update');
    expect(plan('model', [{ v: 'acme', c: 'x1', n: 'X one', p: 'etch;clean' }], map.model)[0]?.planState).toBe('update');
    expect(plan('model', [{ v: 'acme', c: 'x1', n: 'X one', p: 'etch' }], map.model)[0]?.planState).toBe('unchanged');
  });

  it('errors on unknown or inactive processes', () => {
    expect(plan('model', [{ v: 'acme', c: 'n1', n: 'N', p: 'nope' }], map.model)[0]?.errors).toEqual([{ field: 'process_codes', code: 'process_missing' }]);
    expect(plan('model', [{ v: 'acme', c: 'n1', n: 'N', p: 'dead' }], map.model)[0]?.errors).toEqual([{ field: 'process_codes', code: 'process_inactive' }]);
  });
});

describe('planRows: software', () => {
  it.each([
    ['new', { v: 'acme', m: 'x1', k: '2.0', n: 'Two' }, 'new'],
    ['unchanged', { v: 'acme', m: 'x1', k: '1.0', n: 'Release one' }, 'unchanged'],
    ['update', { v: 'acme', m: 'x1', k: '1.0', n: 'Renamed' }, 'update'],
    ['conflict (inactive version)', { v: 'acme', m: 'x1', k: '0.9', n: 'Old rel' }, 'conflict'],
  ])('%s', (_l, raw, state) => {
    expect(plan('software', [raw], map.software)[0]?.planState).toBe(state);
  });

  it('errors parent_missing for an unknown vendor or model and parent_inactive for an inactive model', () => {
    expect(plan('software', [{ v: 'nobody', m: 'x1', k: '1', n: '' }], map.software)[0]?.errors).toEqual([{ field: 'vendor_code', code: 'parent_missing' }]);
    expect(plan('software', [{ v: 'acme', m: 'zz', k: '1', n: '' }], map.software)[0]?.errors).toEqual([{ field: 'model_code', code: 'parent_missing' }]);
    expect(plan('software', [{ v: 'acme', m: 'gone', k: '1', n: '' }], map.software)[0]?.errors).toEqual([{ field: 'model_code', code: 'parent_inactive' }]);
  });
});

describe('planRows: parse errors and job status', () => {
  it('any carried error forces error and no target', () => {
    const { normalized } = normalizeRow('vendor', { c: 'acme', n: 'Acme' }, map.vendor);
    const [r] = planRows('vendor', [{ rowNo: 1, normalized, errors: [{ field: 'n', code: 'formula' }] }], snapshot());
    expect(r).toMatchObject({ planState: 'error', targetId: null, errors: [{ field: 'n', code: 'formula' }] });
  });

  it('is validated only without error or conflict rows', () => {
    const base = { pending: 0, new: 2, unchanged: 1, update: 1, conflict: 0, error: 0 };
    expect(statusAfterValidate(base)).toBe('validated');
    expect(statusAfterValidate({ ...base, conflict: 1 })).toBe('review_required');
    expect(statusAfterValidate({ ...base, error: 1 })).toBe('review_required');
  });
});
