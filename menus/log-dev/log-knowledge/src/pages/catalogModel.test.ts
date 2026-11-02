import { describe, expect, it } from 'vitest';
import { encodeFilterParam, encodeFilterParams } from '@ap/contracts';
import type { ModelRow, VendorRow } from '../endpoints';
import { childLink, defaultFilterParams, failureText, fieldErrorText, impactText, isFocusValue, isRowMuted, mapFieldErrors, softwareSummary, tabOf, tabPatch } from './catalogModel';

const stamps = { id: '00000001-0000-4000-8000-000000000001', code: 'ALPHA', name: 'Alpha', version: '1', createdAt: '', updatedAt: '' };
const vendor = (patch: Partial<VendorRow> = {}): VendorRow => ({ ...stamps, active: true, modelCount: 3, ...patch });
const model = (patch: Partial<ModelRow> = {}): ModelRow => ({ ...stamps, active: true, vendorId: 'v', vendorName: 'V', processes: [], softwareCount: 2, latestSoftwareLabel: 'v2.0', ...patch });

describe('page keys', () => {
  it.each([[null, 'model'], ['vendor', 'vendor'], ['software', 'software'], ['nope', 'invalid'], ['', 'invalid']] as const)('tab %s -> %s', (raw, expected) => {
    expect(tabOf(raw)).toBe(expected);
  });
  it.each([['new', true], ['00000001-0000-4000-8000-000000000001', true], ['12', false], ['', false]] as const)('focus %s -> %s', (raw, ok) => {
    expect(isFocusValue(raw)).toBe(ok);
  });
});

describe('tab links', () => {
  it('opens the child tab with the parent as the filter, active rows only, and clears the old tab\'s search, sort, page and row', () => {
    const patch = tabPatch(childLink(vendor(), 'vendor'));
    expect(patch).toMatchObject({ tab: 'model', q: null, sort: null, page: null, focus: null });
    expect(patch.filter).toEqual(encodeFilterParams([{ id: 'active', op: 'in', value: ['true'] }, { id: 'vendorId', op: 'in', value: [stamps.id] }]));
  });
  it.each([['vendor', 'model', 'vendorId'], ['process', 'model', 'processes'], ['model', 'software', 'modelId']] as const)('%s count -> %s tab filtered by %s', (from, tab, field) => {
    const link = childLink(vendor(), from);
    expect(link.tab).toBe(tab);
    expect(link.filter.at(-1)).toBe(encodeFilterParam({ id: field, op: 'in', value: [stamps.id] }));
  });
  it('opens every tab at 활성', () => {
    expect(defaultFilterParams()).toEqual(encodeFilterParams([{ id: 'active', op: 'in', value: ['true'] }]));
  });
});

describe('field errors', () => {
  it.each([
    ['required', 'code', '필수 항목입니다'],
    ['too_long', 'name', '입력 길이가 너무 깁니다'],
    ['malformed', 'code', '사용할 수 없는 문자가 들어 있습니다'],
    ['duplicate', 'code', '같은 코드가 이미 있습니다'],
    ['duplicate', 'versionLabel', '같은 버전 표기가 이미 있습니다'],
    ['not_found', 'vendorId', '찾을 수 없는 항목입니다'],
    ['inactive', 'processIds', '비활성 항목에는 연결할 수 없습니다'],
  ])('%s on %s reads %s', (code, field, text) => {
    expect(fieldErrorText(code, field)).toBe(text);
    expect(mapFieldErrors([{ path: [field], code }], ['code', 'name', 'vendorId', 'processIds', 'versionLabel'])).toEqual({ [field]: text });
  });
  it('keeps the first error per field, reads a path head such as processIds.0, and files unknown fields under form', () => {
    const fields = ['code', 'processIds'];
    expect(mapFieldErrors([{ path: ['code'], code: 'duplicate' }, { path: ['code'], code: 'required' }], fields)).toEqual({ code: '같은 코드가 이미 있습니다' });
    expect(mapFieldErrors([{ path: ['processIds', '0'], code: 'inactive' }], fields)).toEqual({ processIds: '비활성 항목에는 연결할 수 없습니다' });
    expect(mapFieldErrors([{ path: ['id'], code: 'not_found' }], fields)).toEqual({ form: '찾을 수 없는 항목입니다' });
  });
  it.each([['forbidden', '권한'], ['not_found', '찾을 수 없'], ['error', '저장하지 못했습니다'], ['unknown', '저장하지 못했습니다']])('banner text for %s', (outcome, part) => {
    expect(failureText(outcome)).toContain(part);
  });
});

describe('deactivation impact', () => {
  it('counts active children and says they stay unchanged (ADR-0107 decision 4)', () => {
    expect(impactText('vendor', vendor({ modelCount: 3 }))).toContain('활성 모델 3개');
    expect(impactText('process', vendor({ modelCount: 1 }))).toContain('활성 모델 1개');
    expect(impactText('model', model({ softwareCount: 2 }))).toContain('활성 SW 버전 2개');
    for (const text of [impactText('vendor', vendor()), impactText('model', model())]) expect(text).toContain('바뀌지 않고');
  });
});

describe('table rows', () => {
  it('mutes exactly the inactive rows', () => {
    expect(isRowMuted({ active: false })).toBe(true);
    expect(isRowMuted({ active: true })).toBe(false);
  });
  it.each([[0, null, '—'], [1, 'v1.0', 'v1.0'], [3, 'v2.0', 'v2.0 외 2']] as const)('SW 버전 cell with %s versions', (count, label, text) => {
    expect(softwareSummary(model({ softwareCount: count, latestSoftwareLabel: label }))).toBe(text);
  });
});
