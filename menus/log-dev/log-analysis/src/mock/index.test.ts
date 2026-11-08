import { emptyGlobal } from '@ap/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { logAnalysisMock, logAnalysisActionsMock, resetExplorer } from './index';
import { recordsEndpoint, investigationDetailEndpoint, evidenceAdd, evidenceHandoff, periodsEndpoint, windowEndpoint } from '../endpoints';

const endpoint = (id: string) => logAnalysisMock.find(e => e.spec.id === id)!;
const input = (params: unknown) => ({ params, actor: 'engineer' as const, equipment: [], context: { ...emptyGlobal } });
beforeEach(resetExplorer);
describe('synthetic log explorer (#1473)', () => {
  it('answers bounded records in file order and uses opaque cursor paging', () => {
    const detail = endpoint(investigationDetailEndpoint.id).handle(input({ investigationId: '14730000-0000-4000-8000-000000000001' }));
    const first = endpoint(recordsEndpoint.id).handle(input({ sampleSet: detail.sampleSet, query: {}, cursor: null, limit: 50 }));
    expect(first.synthetic).toBe(true);
    expect(first.rows).toHaveLength(50);
    const second = endpoint(recordsEndpoint.id).handle(input({ sampleSet: detail.sampleSet, query: {}, cursor: first.nextCursor, limit: 50 }));
    expect(second.rows[0].line).toBe(51);
    expect(first.rows[0].text).toContain('<script>');
  });
  it.each(['absent', 'revoked', 'partial', 'truncated', 'unsupported'])('exposes the %s answered state without fabricated rows', mode => {
    const detail = endpoint(investigationDetailEndpoint.id).handle(input({ investigationId: '14730000-0000-4000-8000-000000000001' }));
    const spec = mode === 'unsupported' ? periodsEndpoint : recordsEndpoint;
    const answer = endpoint(spec.id).handle(input({ sampleSet: { ...detail.sampleSet, sourceOwner: `synthetic-${mode}` }, query: {}, cursor: null, limit: 50 }));
    expect(answer.state).toBe(({ absent: 'source_absent', revoked: 'permission_denied', partial: 'partial', truncated: 'truncated', unsupported: 'unsupported' })[mode]);
    if (mode === 'revoked' || mode === 'absent' || mode === 'unsupported') expect(answer.rows).toEqual([]);
  });
  it('stores evidence locations only, advances versions and refuses duplicate/body-bearing refs', () => {
    const action = logAnalysisActionsMock.find(a => a.spec.id === evidenceAdd.id)!;
    const id = '14730000-0000-4000-8000-000000000001';
    const ref = { fileRef: 'source-b', line: 1, fileSha256: 'b'.repeat(64) };
    expect(action.validate?.({ id, ref: { ...ref, text: 'private' } })).not.toEqual([]);
    expect(action.version?.({ actor: 'engineer', scopeId: null, input: { id, ref } })).toBe('1');
    action.handle({ actor: 'engineer', scopeId: null, input: { id, ref } });
    expect(action.version?.({ actor: 'engineer', scopeId: null, input: { id, ref } })).toBe('2');
    expect(() => action.handle({ actor: 'engineer', scopeId: null, input: { id, ref } })).toThrow();
    const detail = endpoint(investigationDetailEndpoint.id).handle(input({ investigationId: id }));
    expect(detail.evidence[0].ref).toEqual(ref);
    expect(JSON.stringify(detail.evidence)).not.toContain('private');
  });
  it('hands off the basket to the investigation\'s own Round once, then reports alreadyAttached', () => {
    const add = logAnalysisActionsMock.find(a => a.spec.id === evidenceAdd.id)!;
    const hand = logAnalysisActionsMock.find(a => a.spec.id === evidenceHandoff.id)!;
    const id = '14730000-0000-4000-8000-000000000007';
    const ref = { fileRef: 'source-b', line: 1, fileSha256: 'b'.repeat(64) };
    add.handle({ actor: 'engineer', scopeId: null, input: { id, ref } });
    const call = { actor: 'engineer' as const, scopeId: null, input: { id, refs: [ref], target: { kind: 'round', roundId: '14740000-0000-4000-8000-000000000001' } } };
    expect(hand.handle(call).data).toMatchObject({ handedOff: 1, alreadyAttached: 0 });
    expect(hand.handle(call).data).toMatchObject({ handedOff: 0, alreadyAttached: 1 });
    expect(() => hand.handle({ ...call, input: { ...call.input, id: '14730000-0000-4000-8000-000000000001' } })).toThrow();
  });
  it('does not reveal another actor’s saved investigation', () => {
    expect(endpoint(investigationDetailEndpoint.id).handle({ ...input({ investigationId: '14730000-0000-4000-8000-000000000001' }), actor: 'viewer' })).toBeNull();
  });
});

describe('synthetic window read for a Round sample list (#1475)', () => {
  it('answers the selected line for a file the explorer catalog does not know, from the supplied source owner and file', () => {
    const answer = endpoint(windowEndpoint.id).handle(input({ sourceOwner: 'synthetic-team', fileRef: 's3://synthetic/sample-01.log', line: 186, before: 1, after: 1 }));
    expect(answer.state).toBe('ok');
    expect(answer.rows.map((r: { line: number }) => r.line)).toEqual([185, 186, 187]);
    expect(answer.rows.every((r: { fileRef: string }) => r.fileRef === 's3://synthetic/sample-01.log')).toBe(true);
    expect(answer.rows[1].text).toMatch(/^186 Module 1 End Job-1/);
  });
  it('still answers no rows for a revoked or absent source owner', () => {
    for (const owner of ['synthetic-revoked', 'synthetic-absent']) {
      expect(endpoint(windowEndpoint.id).handle(input({ sourceOwner: owner, fileRef: 's3://synthetic/sample-01.log', line: 1, before: 0, after: 0 })).rows).toEqual([]);
    }
  });
});

describe('knowledge handoff mock (#1474c)', () => {
  const id = '14730000-0000-4000-8000-000000000008';
  const call = (endpointId: string, params: unknown = {}) => endpoint(`logExplorer.${endpointId}`).handle(input(params));
  const hand = () => logAnalysisActionsMock.find(a => a.spec.id === evidenceHandoff.id)!;
  it('checks a seeded mismatch and unresolved ref without source bodies', () => {
    const check = call('handoffCheck', { investigationId: id });
    expect(check).toMatchObject({ state: 'ok', refs: expect.arrayContaining([expect.objectContaining({ status: 'hash_mismatch' }), expect.objectContaining({ status: 'unresolved' })]) });
    expect(check.refs.every((r: object) => Object.keys(r).length === 3)).toBe(true);
  });
  it('creates and appends with de-duplication and updates the caller-only list', () => {
    const detail = call('investigationDetail', { investigationId: id });
    const refs = detail.evidence.slice(0, 2).map(({ ref }: { ref: unknown }) => ref);
    const target = { kind: 'knowledgeDraft', mode: 'create', owner: { modelId: call('handoffModels', { q: null, page: 0, pageSize: 20 }).rows[0].id }, title: '새 합성 초안', observation: '관찰 사실' };
    const created = hand().handle({ actor: 'engineer', scopeId: null, input: { id, refs, target } });
    expect(created.data).toMatchObject({ targetKind: 'knowledgeDraft', handedOff: 2 });
    const appended = hand().handle({ actor: 'engineer', scopeId: null, input: { id, refs, target: { kind: 'knowledgeDraft', mode: 'append', draftId: created.data.targetId, draftExpectedVersion: created.data.draftVersion } } });
    expect(appended.data.draftVersion).not.toBe(created.data.draftVersion);
    expect(call('handoffDrafts').rows.find((r: { draftId: string }) => r.draftId === created.data.targetId).evidenceCount).toBe(2);
    expect(endpoint('logExplorer.handoffDrafts').handle({ ...input({}), actor: 'viewer' }).rows).toEqual([]);
  });
  it('exposes a reproducible field refusal and draft conflict for capture', () => {
    const detail = call('investigationDetail', { investigationId: id });
    const target = { kind: 'knowledgeDraft', mode: 'create', owner: { modelId: '14740000-0000-4000-8000-000000000010' }, title: '[field-error]', observation: '관찰 사실' };
    expect(() => hand().handle({ actor: 'engineer', scopeId: null, input: { id, refs: [detail.evidence[0].ref], target } })).toThrow();
    expect(() => hand().handle({ actor: 'engineer', scopeId: null, input: { id, refs: [detail.evidence[0].ref], target: { ...target, title: '[conflict]' } } })).toThrow();
  });
});
