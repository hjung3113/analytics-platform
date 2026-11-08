import { emptyGlobal } from '@ap/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { logAnalysisMock, logAnalysisActionsMock, resetExplorer } from './index';
import { recordsEndpoint, investigationDetailEndpoint, evidenceAdd, evidenceHandoff, periodsEndpoint } from '../endpoints';

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
