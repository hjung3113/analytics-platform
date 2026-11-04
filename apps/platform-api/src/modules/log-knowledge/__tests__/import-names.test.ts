// #1195 b2 — name-only model sheet: header recognition, the names shape of the mapping, normalization, planning with
// parents created in the same plan, the name fallback, and the blank-code create.

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { validateCatalogInput } from '../domain/catalog-input.js';
import { CODE_MAX } from '../domain/code-key.js';
import { type HeaderFailure, parseImportFile } from '../domain/import-file.js';
import { modelHeaderFailure, recognizeModelHeaders } from '../domain/import-headers.js';
import { validateMapping } from '../domain/import-mapping.js';
import {
  type CatalogRef,
  type CatalogSnapshot,
  type ModelRef,
  type PlanInput,
  normalizeRow,
  planRows,
} from '../domain/import-plan.js';

const enc = (s: string) => new TextEncoder().encode(s);
const NAMES = { vendor_name: 'maker', model_name: 'model', process_names: 'proc' };

describe('model header recognition', () => {
  it.each([
    [['메이커명', '모델명', '공정명'], { vendor_name: '메이커명', model_name: '모델명', process_names: '공정명' }],
    [['제조사', '모델', '공정'], { vendor_name: '제조사', model_name: '모델', process_names: '공정' }],
    [['메이커', '모델명'], { vendor_name: '메이커', model_name: '모델명' }],
    [['vendor_name', 'model_name', 'process_names', 'memo'], { vendor_name: 'vendor_name', model_name: 'model_name', process_names: 'process_names' }],
    // trim + NFKC: a full-width ASCII alias and padding still match
    [[' ｖｅｎｄｏｒ＿ｎａｍｅ ', 'model_name'], { vendor_name: ' ｖｅｎｄｏｒ＿ｎａｍｅ ', model_name: 'model_name' }],
    // the old code headers stay accepted, and a code column stands in for its name column
    [['vendor_code', 'model_code', 'model_name', 'process_codes'], { vendor_code: 'vendor_code', model_code: 'model_code', model_name: 'model_name', process_codes: 'process_codes' }],
  ])('maps %j', (headers, mapping) => {
    expect(recognizeModelHeaders(headers)).toEqual({ kind: 'mapped', mapping });
  });

  it('reports a missing required header by its expected name', () => {
    expect(recognizeModelHeaders(['모델명', '공정명'])).toEqual({ kind: 'failed', code: 'missing_header', headers: ['메이커명'] });
    expect(recognizeModelHeaders(['메이커명'])).toEqual({ kind: 'failed', code: 'missing_header', headers: ['모델명'] });
    expect(recognizeModelHeaders(['공정명'])).toEqual({ kind: 'failed', code: 'missing_header', headers: ['메이커명', '모델명'] });
  });

  it('reports identical and alias-equivalent headers as duplicate_header naming them', () => {
    expect(recognizeModelHeaders(['메이커명', '메이커명', '모델명'])).toEqual({ kind: 'failed', code: 'duplicate_header', headers: ['메이커명', '메이커명'] });
    expect(recognizeModelHeaders(['메이커명', '제조사', '모델명'])).toEqual({ kind: 'failed', code: 'duplicate_header', headers: ['메이커명', '제조사'] });
  });

  it('leaves a sheet with no known header to importMap', () => {
    expect(recognizeModelHeaders(['v', 'c', 'n'])).toEqual({ kind: 'none' });
    expect(modelHeaderFailure(['v', 'c', 'n'])).toBeNull();
  });
});

describe('model upload: header failures are file-level and name the headers', () => {
  const opts = { recognizeHeaders: modelHeaderFailure };
  it('refuses a csv with a missing or duplicate header', async () => {
    expect(await parseImportFile(enc('모델명,공정명\nX,CMP\n'), 'm.csv', opts)).toMatchObject({ ok: false, code: 'missing_header', status: 400, detail: ['메이커명'] });
    expect(await parseImportFile(enc('메이커명,메이커명,모델명\nA,A,X\n'), 'm.csv', opts)).toMatchObject({ ok: false, code: 'duplicate_header', detail: ['메이커명', '메이커명'] });
    expect(await parseImportFile(enc('메이커명,제조사,모델명\nA,A,X\n'), 'm.csv', opts)).toMatchObject({ ok: false, code: 'duplicate_header', detail: ['메이커명', '제조사'] });
  });
  it('keeps blank-header refusal, and other entities refuse identical headers as before', async () => {
    expect(await parseImportFile(enc('메이커명,,모델명\nA,B,X\n'), 'm.csv', opts)).toMatchObject({ ok: false, code: 'invalid_headers' });
    expect(await parseImportFile(enc('a,b,a\n1,2,3\n'), 'v.csv')).toMatchObject({ ok: false, code: 'invalid_headers' });
    expect(await parseImportFile(enc('a,b,a\n1,2,3\n'), 'm.csv', opts)).toMatchObject({ ok: false, code: 'invalid_headers' });
  });
  it('refuses an xlsx the same way', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('s');
    sheet.addRow(['메이커명', '메이커명', '모델명']);
    sheet.addRow(['A', 'A', 'X']);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    const failure: Extract<Awaited<ReturnType<typeof parseImportFile>>, { ok: false }> = { ok: false, code: 'duplicate_header', status: 400, detail: ['메이커명', '메이커명'] };
    expect(await parseImportFile(bytes, 'm.xlsx', opts)).toEqual(failure satisfies { detail?: HeaderFailure['headers'] });
  });
});

describe('mapping of the names shape', () => {
  const headers = ['maker', 'model', 'proc', 'mc'];
  it('accepts vendor_name + model_name, code columns optional', () => {
    expect(validateMapping('model', headers, { vendor_name: 'maker', model_name: 'model' })).toEqual([]);
    expect(validateMapping('model', headers, { vendor_name: 'maker', model_name: 'model', process_names: 'proc', model_code: 'mc' })).toEqual([]);
  });
  it('requires model_name in the names shape; the code shape is unchanged', () => {
    expect(validateMapping('model', headers, { vendor_name: 'maker' }).map((e) => `${e.path.join('.')}/${e.code}`)).toEqual(['mapping.model_name/required']);
    expect(validateMapping('model', headers, { vendor_code: 'maker', model_code: 'mc', model_name: 'model' })).toEqual([]);
  });
});

describe('normalizeRow: names shape', () => {
  it('splits process names on commas, trims, drops empties and derives the codes from the names', () => {
    const { normalized, errors } = normalizeRow('model', { maker: ' Demo Vendor ', model: ' X 1 ', proc: ' CMP , Etch ,, ' }, NAMES);
    expect(errors).toEqual([]);
    expect(normalized).toMatchObject({
      vendorCode: 'Demo Vendor', vendorKey: 'DEMO VENDOR', vendorName: 'Demo Vendor', vendorNameKey: 'DEMO VENDOR',
      code: 'X 1', codeKey: 'X 1', name: 'X 1', processCodes: ['CMP', 'Etch'], processKeys: ['CMP', 'ETCH'],
      processCreatable: true, processesMapped: true,
    });
  });
  it('lets a code cell win over the name for the key', () => {
    const { normalized } = normalizeRow('model', { vc: 'v-1', maker: 'Demo', mc: 'm-1', model: 'X', pc: 'p-1', proc: 'CMP' }, {
      vendor_code: 'vc', vendor_name: 'maker', model_code: 'mc', model_name: 'model', process_codes: 'pc', process_names: 'proc',
    });
    expect(normalized).toMatchObject({ vendorKey: 'V-1', vendorName: 'Demo', codeKey: 'M-1', name: 'X', processKeys: ['P-1'], processCreatable: false });
  });
  it('reports a repeated process and a blank name on the name columns', () => {
    expect(normalizeRow('model', { maker: 'A', model: 'X', proc: 'cmp, CMP' }, NAMES).errors).toEqual([{ field: 'process_names', code: 'duplicate' }]);
    expect(normalizeRow('model', { maker: '', model: '', proc: '' }, NAMES).errors).toEqual([
      { field: 'vendor_name', code: 'required' },
      { field: 'model_name', code: 'required' },
    ]);
  });
  it.each([
    [CODE_MAX, []],
    [CODE_MAX + 1, ['too_long']],
  ])('derived codes of %i code points: maker, model and process', (length, codes) => {
    const text = '가'.repeat(length);
    const maker = normalizeRow('model', { maker: text, model: 'X', proc: '' }, NAMES).errors;
    const mod = normalizeRow('model', { maker: 'A', model: text, proc: '' }, NAMES).errors;
    const proc = normalizeRow('model', { maker: 'A', model: 'X', proc: text }, NAMES).errors;
    expect(maker).toEqual(codes.map((code) => ({ field: 'vendor_name', code })));
    expect(mod).toEqual(codes.map((code) => ({ field: 'model_name', code })));
    expect(proc).toEqual(codes.map((code) => ({ field: 'process_names', code })));
  });
});

const ref = (id: string, name: string, active = true, rowVersion = 3): CatalogRef => ({ id, name, active, rowVersion });
const modelRef = (id: string, name: string, processIds: string[] = [], active = true): ModelRef => ({ ...ref(id, name, active), processIds: new Set(processIds) });
function snapshot(): CatalogSnapshot {
  const acme = ref('v-acme', 'Acme Corp');
  const old = ref('v-old', 'Old Maker', false);
  const twin1 = ref('v-t1', 'Twin');
  const twin2 = ref('v-t2', 'twin');
  const etch = ref('p-etch', 'Etch');
  const dead = ref('p-dead', 'Dead', false);
  const polish1 = ref('p-d1', 'Polish');
  const polish2 = ref('p-d2', 'POLISH');
  const x1 = modelRef('m-x1', 'X one', ['p-etch']);
  const a = modelRef('m-a', 'Same name');
  const b = modelRef('m-b', 'same  name');
  return {
    vendors: new Map([['ACME', acme], ['OLD', old], ['TWIN-1', twin1], ['TWIN-2', twin2]]),
    processes: new Map([['ETCH', etch], ['DEAD', dead], ['DUP-1', polish1], ['DUP-2', polish2]]),
    models: new Map([['v-acme|X1', x1], ['v-acme|CODE-A', a], ['v-acme|CODE-B', b]]),
    softwares: new Map(),
    vendorNames: new Map([['ACME CORP', [acme]], ['OLD MAKER', [old]], ['TWIN', [twin1, twin2]]]),
    processNames: new Map([['ETCH', [etch]], ['POLISH', [polish1, polish2]]]),
    modelNames: new Map([['v-acme|X ONE', [x1]], ['v-acme|SAME NAME', [a, b]]]),
  };
}
function plan(raws: Record<string, string>[], mapping: Record<string, string> = NAMES, catalog = snapshot()) {
  const inputs: PlanInput[] = raws.map((raw, i) => {
    const { normalized, errors } = normalizeRow('model', raw, mapping);
    return { rowNo: i + 1, normalized, errors };
  });
  return planRows('model', inputs, catalog);
}

describe('planRows: names shape', () => {
  it('plans a model under a new maker and new processes as new, listing what it creates', () => {
    const [r] = plan([{ maker: 'Demo Vendor', model: 'DM-1', proc: 'CMP, Etch' }]);
    expect(r).toMatchObject({ planState: 'new', errors: [], creates: { vendor: 'Demo Vendor', processes: ['CMP'] } });
  });
  it('lists a maker named on several rows on each row (the apply creates it once)', () => {
    const plans = plan([
      { maker: 'Demo Vendor', model: 'A', proc: '' },
      { maker: 'DEMO VENDOR', model: 'B', proc: '' },
    ]);
    expect(plans.map((p) => [p.planState, p.creates?.vendor])).toEqual([['new', 'Demo Vendor'], ['new', 'DEMO VENDOR']]);
  });
  it('matches an existing maker by code_key, else by normalized name, and a model by name', () => {
    expect(plan([{ maker: 'acme', model: 'X one', proc: 'Etch' }])[0]).toMatchObject({ planState: 'unchanged', targetId: 'm-x1' }); // maker by code_key, model by name
    expect(plan([{ maker: 'ACME  CORP', model: 'x one', proc: '' }])[0]).toMatchObject({ planState: 'update', targetId: 'm-x1' }); // maker by name; the name's case differs
    expect(plan([{ maker: 'Acme Corp', model: 'X one', proc: 'Etch, CMP' }])[0]).toMatchObject({ planState: 'update', targetId: 'm-x1', creates: { processes: ['CMP'] } });
  });
  it('flags two rows that resolve to one model as duplicate_in_file', () => {
    const plans = plan([{ maker: 'Acme', model: 'X1', proc: '' }, { maker: 'Acme Corp', model: 'X one', proc: '' }]);
    expect(plans[1]?.errors).toEqual([{ field: 'model_name', code: 'duplicate_in_file' }]);
  });
  it('is a conflict ambiguous_name when two models match the name', () => {
    const [r] = plan([{ maker: 'Acme', model: 'Same Name', proc: '' }]);
    expect(r).toMatchObject({ planState: 'conflict', targetId: null, errors: [{ field: 'model_code', code: 'ambiguous_name' }] });
  });
  it('is a conflict ambiguous_parent when two makers or processes match, and parent_inactive for an inactive one', () => {
    expect(plan([{ maker: 'Twin', model: 'M', proc: '' }])[0]).toMatchObject({ planState: 'conflict', errors: [{ field: 'vendor_name', code: 'ambiguous_parent' }] });
    expect(plan([{ maker: 'Acme', model: 'M', proc: 'polish' }])[0]).toMatchObject({ planState: 'conflict', errors: [{ field: 'process_names', code: 'ambiguous_parent' }] });
    expect(plan([{ maker: 'Old Maker', model: 'M', proc: '' }])[0]).toMatchObject({ planState: 'conflict', errors: [{ field: 'vendor_name', code: 'parent_inactive' }] });
    expect(plan([{ maker: 'Acme', model: 'M', proc: 'Dead' }])[0]).toMatchObject({ planState: 'conflict', errors: [{ field: 'process_names', code: 'parent_inactive' }] });
  });
  it('keeps a code-only vendor or process an error, as before', () => {
    const codeMap = { vendor_code: 'vc', model_code: 'mc', model_name: 'model', process_codes: 'pc' };
    expect(plan([{ vc: 'nobody', mc: 'M', model: 'M', pc: '' }], codeMap)[0]?.errors).toEqual([{ field: 'vendor_code', code: 'parent_missing' }]);
    expect(plan([{ vc: 'acme', mc: 'M', model: 'M', pc: 'nope' }], codeMap)[0]?.errors).toEqual([{ field: 'process_codes', code: 'process_missing' }]);
  });
});

describe('catalog create: blank code', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const derive = { deriveCode: true } as const;
  it.each([
    ['vendor', { name: 'Demo' }],
    ['vendor', { code: '   ', name: 'Demo' }],
    ['process', { code: '', name: 'Etch' }],
    ['model', { vendorId: ID, name: 'X1', processIds: [] }],
  ] as const)('accepts a missing or blank code on a %s create: %j', (kind, input) => {
    expect(validateCatalogInput(kind, 'create', input, derive)).toEqual([]);
  });
  it('keeps the strict rule without the option, on update and for a software version', () => {
    expect(validateCatalogInput('vendor', 'create', { name: 'Demo' })).toEqual([{ path: ['code'], code: 'required' }]);
    expect(validateCatalogInput('vendor', 'update', { id: ID, name: 'Demo' }, derive)).toEqual([{ path: ['code'], code: 'required' }]);
    expect(validateCatalogInput('software', 'create', { modelId: ID, name: 'n' }, derive)).toEqual([{ path: ['versionLabel'], code: 'required' }]);
  });
  it.each(['vendor', 'process', 'model'] as const)('derived code of 64 / 65 code points on a %s', (kind) => {
    const base = kind === 'model' ? { vendorId: ID, processIds: [] } : {};
    expect(validateCatalogInput(kind, 'create', { ...base, name: '가'.repeat(CODE_MAX) }, derive)).toEqual([]);
    expect(validateCatalogInput(kind, 'create', { ...base, name: '가'.repeat(CODE_MAX + 1) }, derive)).toEqual([{ path: ['code'], code: 'too_long' }]);
  });
  it('still requires the name', () => {
    expect(validateCatalogInput('vendor', 'create', {}, derive)).toEqual([{ path: ['name'], code: 'required' }]);
  });
});
