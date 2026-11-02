import { describe, expect, it } from 'vitest';
import { ITEM_LIMITS } from '../../endpoints';
import { createInput, deriveInput, emptyForm, mapItemErrors, reviseInput, validateForm, type WriteForm } from './itemWriteModel';

const KNOWN = ['typeCode', 'title', 'observation', 'expected', 'analysisOpinion', 'improvement', 'changeNote'];
const form = (patch: Partial<WriteForm> = {}): WriteForm => ({ ...emptyForm('m1'), title: '제목', observation: '사실', ...patch });

describe('mapItemErrors', () => {
  it('maps a nested evidence path to its row and field, not to the head', () => {
    expect(mapItemErrors([{ path: ['evidence', '1', 'sourceRef'], code: 'required' }], KNOWN, 2)).toEqual({ 'evidence.1.sourceRef': '필수 항목입니다' });
  });
  it.each(['owner', 'ownerModelId', 'ownerSoftwareId'])('maps %s to the owner controls', path => {
    expect(mapItemErrors([{ path: [path], code: 'not_found' }], KNOWN, 0)).toEqual({ owner: '찾을 수 없는 항목입니다' });
  });
  it('maps the evidence cap to the list and an out-of-range row or unknown path to a visible form error', () => {
    expect(mapItemErrors([{ path: ['evidence'], code: 'too_long' }], KNOWN, 3)).toEqual({ evidenceList: '입력 길이가 너무 깁니다' });
    expect(mapItemErrors([{ path: ['evidence', '7', 'note'], code: 'too_long' }], KNOWN, 2)['form']).toContain('근거');
    expect(mapItemErrors([{ path: ['id'], code: 'archived' }], KNOWN, 0)).toEqual({ form: 'Item: 보관된 Item은 바꿀 수 없습니다' });
  });
  it('keeps the first message per control', () => {
    expect(mapItemErrors([{ path: ['title'], code: 'required' }, { path: ['title'], code: 'too_long' }], KNOWN, 0)).toEqual({ title: '필수 항목입니다' });
  });
});

describe('validateForm', () => {
  it('needs one of 관찰 사실 / 기대·기준, under 관찰 사실, and accepts either', () => {
    expect(validateForm(form({ observation: ' ' }), 'create')['observation']).toContain('하나는');
    expect(validateForm(form({ observation: '', expected: '기준' }), 'create')).toEqual({});
  });
  it('applies the server limits in code points', () => {
    expect(validateForm(form({ title: '가'.repeat(ITEM_LIMITS.title + 1) }), 'create')['title']).toBeDefined();
    expect(validateForm(form({ title: '😀'.repeat(ITEM_LIMITS.title) }), 'create')['title']).toBeUndefined();
    expect(validateForm(form({ changeNote: 'x'.repeat(ITEM_LIMITS.changeNote + 1) }), 'revise')['changeNote']).toBeDefined();
  });
  it('requires an owner for create/derive (the SW version too), none for revise, a 변경 사유 only for revise', () => {
    expect(validateForm(form({ modelId: '' }), 'create')['owner']).toBeDefined();
    expect(validateForm(form({ ownerKind: 'software' }), 'derive')['owner']).toBeDefined();
    expect(validateForm(form({ modelId: '' }), 'revise')['owner']).toBeUndefined();
    expect(validateForm(form(), 'revise')['changeNote']).toBeDefined();
  });
  it('checks each evidence row and ignores evidence in derive', () => {
    const rows = [{ sourceKind: 'spec' as const, sourceOwner: '', sourceRef: 'r', sourceVersion: '', contentHash: '', locator: '', note: '' }];
    expect(validateForm(form({ evidence: rows }), 'create')['evidence.0.sourceOwner']).toBeDefined();
    expect(validateForm(form({ evidence: rows }), 'derive')).toEqual({});
  });
});

describe('action inputs', () => {
  it('sends exactly one owner, blank optionals as null, and no evidence on derive', () => {
    expect(createInput(form({ ownerKind: 'software', modelId: 'm1', softwareId: 's1' }))).toMatchObject({ ownerSoftwareId: 's1', improvement: null });
    expect(createInput(form())).not.toHaveProperty('ownerSoftwareId');
    expect(reviseInput('i1', form({ changeNote: '사유' }))).toMatchObject({ id: 'i1', changeNote: '사유' });
    expect(deriveInput('i1', 2, form())).toMatchObject({ sourceItemId: 'i1', sourceRevisionNo: 2, ownerModelId: 'm1' });
    expect(deriveInput('i1', 2, form())).not.toHaveProperty('evidence');
  });
});
