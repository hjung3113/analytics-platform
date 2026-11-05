import { beforeEach, describe, expect, it } from 'vitest';
import { MockActionInvalid, type AnyMockAction } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog } from './index';
import { resetConcepts, allMappings } from './conceptStore';
import { resetSpecs, SPEC_MODEL, pairModelId } from './specStore';

const A = SPEC_MODEL;
const read = (id: string, params: Record<string, unknown>) => {
  const e = logKnowledgeMock.find(x => x.spec.id === `logKnowledge.${id}`)!;
  const message = e.validate?.({ context: emptyGlobal, params } as never);
  if (message) throw new Error(`refused: ${message}`);
  return e.handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' } as never) as { rows: any[]; total: number; truncated?: boolean };
};
const refusal = (id: string, params: Record<string, unknown>) => logKnowledgeMock.find(x => x.spec.id === `logKnowledge.${id}`)!.validate?.({ context: emptyGlobal, params } as never) ?? null;
const action = (id: string): AnyMockAction => logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${id}`)!;
const codes = (id: string, input: Record<string, unknown>) => (action(id).validate?.(input) ?? []).map((e: any) => `${e.path.join('.')}:${e.code}`);
/** Version check first (the engine's order), then the handler; a handler refusal comes back as `path:code`. */
const send = (id: string, input: Record<string, unknown>, expected?: string) => {
  const a = action(id);
  expect(a.validate?.(input) ?? []).toEqual([]);
  if (a.version && a.version({ input, actor: 'admin', scopeId: null }) !== expected) return { conflict: true } as const;
  try { return { result: a.handle({ input, actor: 'admin', scopeId: null }) as { data: any; version: string | null } }; }
  catch (e) { if (e instanceof MockActionInvalid) return { invalid: e.fieldErrors.map(x => `${x.path.join('.')}:${x.code}`) }; throw e; }
};
const mapping = (key: string, modelId = A) => allMappings().find(m => m.modelId === modelId && m.targetKey === key)!;
beforeEach(() => { resetCatalog(); resetSpecs(); resetConcepts(); });

describe('concept fixtures', () => {
  it('seeds a confirmed pair, a proposed pair, a rejected pair and a target_gone row', () => {
    const rows = read('conceptMappings', { pageSize: 200 }).rows;
    const by = (state: string) => rows.filter(r => r.reviewState === state);
    expect(by('confirmed').map(r => r.targetKey)).toEqual(['CHAMBER/START', 'CHAMBER/START']);
    expect(by('rejected').every(r => r.rejectReason)).toBe(true);
    expect(by('proposed').filter(r => r.targetState === 'present').map(r => r.targetKey)).toEqual(['ROBOT/MOVE', 'ROBOT/MOVE']);
    expect(rows.find(r => r.targetState === 'target_gone')).toMatchObject({ targetKey: 'ROBOT/CALIBRATE', targetName: null, modelId: pairModelId() });
  });
  it('filters by model, concept, state and kind and pages with a total', () => {
    expect(read('conceptMappings', { modelId: A.toUpperCase() }).total).toBe(3);
    const conceptId = mapping('ROBOT/MOVE').conceptId;
    expect(read('conceptMappings', { conceptId }).rows).toHaveLength(2);
    expect(read('conceptMappings', { reviewState: 'rejected', kind: 'event' }).total).toBe(2);
    expect(read('conceptMappings', { kind: 'module' }).total).toBe(0);
    const page = read('conceptMappings', { page: 1, pageSize: 3 });
    expect(page.rows).toHaveLength(3); expect(page.total).toBe(7);
  });
  it.each([
    ['conceptMappings', { modelId: 'x' }], ['conceptMappings', { reviewState: 'done' }], ['conceptMappings', { kind: 'field' }], ['conceptMappings', { pageSize: 201 }], ['conceptMappings', { page: -1 }],
    ['conceptSuggestions', {}], ['conceptSuggestions', { modelId: 'x' }], ['conceptSuggestions', { modelId: A, kind: 'field' }],
  ])('%s refuses %j instead of answering an empty page', (id, params) => expect(refusal(id, params)).toEqual(expect.any(String)));
  it('an unknown model answers an empty page', () => {
    expect(read('conceptSuggestions', { modelId: '00000003-0000-4000-8000-0000000000ff' })).toMatchObject({ total: 0, rows: [] });
  });
});

describe('conceptSuggestions', () => {
  it('computes proposals from the current specs: flagged, scored, not stored, a confirmed or rejected pair hidden', () => {
    const before = allMappings().length;
    const data = read('conceptSuggestions', { modelId: A });
    expect(allMappings()).toHaveLength(before);
    expect(data.truncated).toBe(false);
    expect(data.rows.every(r => r.proposal === true && r.score >= 0.5 && r.candidate.modelName)).toBe(true);
    const keys = data.rows.map(r => `${r.kind}:${r.source.targetKey}`);
    expect(keys).toEqual(expect.arrayContaining(['module:CHAMBER', 'module:ROBOT', 'event:ROBOT/MOVE']));
    expect(keys).not.toContain('event:CHAMBER/START'); // confirmed pair
    expect(keys).not.toContain('event:ARM/STOP'); // rejected pair
    expect(read('conceptSuggestions', { modelId: A, kind: 'event' }).rows.every(r => r.kind === 'event')).toBe(true);
    expect(data.rows.map(r => r.score)).toEqual([...data.rows.map(r => r.score)].sort((x, y) => y - x));
  });
  it('a pair rejected from a concept is not suggested again, even after a fresh propose is refused', () => {
    const rejected = mapping('ARM/STOP');
    expect(send('conceptPropose', { modelId: A, targetKind: 'event', target: { module: 'Arm', event: 'Stop' }, conceptId: rejected.conceptId })).toEqual({ invalid: ['target:already_rejected'] });
  });
});

describe('conceptPropose', () => {
  const body = { modelId: A, targetKind: 'module', target: { module: ' robot ' }, canonicalLabel: '로봇' };
  it('stores a proposed human row, picks an existing concept by label key, and normalises the target key', () => {
    const one = send('conceptPropose', body);
    expect(one).toMatchObject({ result: { data: { mappingId: expect.any(String) }, version: null } });
    const row = read('conceptMappings', { reviewState: 'proposed', kind: 'module' }).rows[0];
    expect(row).toMatchObject({ targetKey: 'ROBOT', targetName: 'Robot', origin: 'human', relationKind: 'equivalent', reviewState: 'proposed', version: 1, conceptLabel: '로봇' });
    expect(send('conceptPropose', { ...body, modelId: pairModelId() }).result?.data.conceptId).toBe(one.result?.data.conceptId);
    expect(send('conceptPropose', body)).toEqual({ invalid: ['target:already_mapped'] });
  });
  it('pairWith proposes both targets on one concept, scored server-side with origin similarity', () => {
    const out = send('conceptPropose', { ...body, pairWith: { modelId: pairModelId(), targetKind: 'module', target: { module: 'Robot' } }, relationKind: 'related' });
    const { mappingId, pairMappingId } = out.result!.data;
    const rows = read('conceptMappings', { conceptId: out.result!.data.conceptId }).rows;
    expect(rows.map(r => r.id).sort()).toEqual([mappingId, pairMappingId].sort());
    expect(rows.every(r => r.origin === 'similarity' && r.similarityScore === 1 && r.relationKind === 'related' && r.reviewState === 'proposed')).toBe(true);
  });
  it('writes nothing when the pair side is refused', () => {
    const n = allMappings().length;
    const out = send('conceptPropose', { ...body, pairWith: { modelId: pairModelId(), targetKind: 'module', target: { module: 'Nope' } } });
    expect(out).toEqual({ invalid: ['pairWith.targetKey:not_found'] });
    expect(allMappings()).toHaveLength(n);
  });
  it.each([
    ['both concept and label', { ...body, conceptId: '00000008-0000-4000-8000-000000000001' }, ['concept:required_one']],
    ['neither', { modelId: A, targetKind: 'module', target: { module: 'Robot' } }, ['concept:required_one']],
    ['bad model', { ...body, modelId: 'x' }, ['modelId:malformed']],
    ['missing kind', { modelId: A, target: { module: 'x' }, canonicalLabel: 'x' }, ['targetKind:required']],
    ['event target without event', { ...body, targetKind: 'event' }, ['target.event:required']],
    ['extra target key', { ...body, target: { module: 'Robot', event: 'x' } }, ['target:malformed']],
    ['long label', { ...body, canonicalLabel: 'x'.repeat(201) }, ['canonicalLabel:too_long']],
    ['long description', { ...body, description: 'x'.repeat(1001) }, ['description:too_long']],
    ['bad relation', { ...body, relationKind: 'same' }, ['relationKind:malformed']],
    ['same target pair', { ...body, pairWith: { modelId: A, targetKind: 'module', target: { module: 'ROBOT' } } }, ['pairWith:same_target']],
    ['pair of another kind', { ...body, pairWith: { modelId: pairModelId(), targetKind: 'event', target: { module: 'Robot', event: 'Move' } } }, ['pairWith.targetKind:malformed']],
    ['pair without model', { ...body, pairWith: { targetKind: 'module', target: { module: 'Robot' } } }, ['pairWith.modelId:required']],
  ])('value error: %s', (_n, input, expected) => expect(codes('conceptPropose', input)).toEqual(expected));
  it('state refusals: unknown model, no spec, unknown key, unknown or other-kind concept', () => {
    expect(send('conceptPropose', { ...body, modelId: '00000003-0000-4000-8000-0000000000ff' })).toEqual({ invalid: ['modelId:not_found'] });
    expect(send('conceptPropose', { ...body, modelId: '00000003-0000-4000-8000-00000000000b' })).toEqual({ invalid: ['revision:none_published'] });
    expect(send('conceptPropose', { ...body, target: { module: 'Gone' } })).toEqual({ invalid: ['targetKey:not_found'] });
    expect(send('conceptPropose', { modelId: A, targetKind: 'module', target: { module: 'Robot' }, conceptId: '00000008-0000-4000-8000-0000000000ff' })).toEqual({ invalid: ['conceptId:not_found'] });
    expect(send('conceptPropose', { modelId: A, targetKind: 'module', target: { module: 'Robot' }, conceptId: mapping('ROBOT/MOVE').conceptId })).toEqual({ invalid: ['conceptId:kind_mismatch'] });
  });
});

describe('conceptConfirm / conceptReject', () => {
  it('confirm bumps the version and answers it; a stale version conflicts before any state refusal', () => {
    const row = mapping('ROBOT/MOVE');
    expect(send('conceptConfirm', { mappingId: row.id }, '9')).toEqual({ conflict: true });
    const ok = send('conceptConfirm', { mappingId: row.id }, '1');
    expect(ok.result).toMatchObject({ data: { mappingId: row.id }, version: '2' });
    expect(row).toMatchObject({ reviewState: 'confirmed', reviewedBy: expect.any(String) });
    // confirmed rows are at version 2, a client holding 1 conflicts (even though the state would also refuse)
    expect(send('conceptConfirm', { mappingId: row.id }, '1')).toEqual({ conflict: true });
    expect(send('conceptConfirm', { mappingId: row.id }, '2')).toEqual({ invalid: ['mapping:already_confirmed'] });
  });
  it('one confirmed equivalent per target; a related row is exempt', () => {
    const second = send('conceptPropose', { modelId: A, targetKind: 'event', target: { module: 'Chamber', event: 'Start' }, canonicalLabel: '다른 시작' }).result!.data.mappingId;
    expect(send('conceptConfirm', { mappingId: second }, '1')).toEqual({ invalid: ['target:already_confirmed'] });
    const related = send('conceptPropose', { modelId: A, targetKind: 'event', target: { module: 'Chamber', event: 'Start' }, canonicalLabel: '다른 시작2', relationKind: 'related' }).result!.data.mappingId;
    expect(send('conceptConfirm', { mappingId: related }, '1').result?.version).toBe('2');
  });
  it('a target_gone row cannot be confirmed but can be rejected', () => {
    const gone = mapping('ROBOT/CALIBRATE', pairModelId());
    expect(send('conceptConfirm', { mappingId: gone.id }, '1')).toEqual({ invalid: ['targetKey:not_found'] });
    expect(send('conceptReject', { mappingId: gone.id, reason: ' 더 이상 쓰지 않음 ' }, '1').result?.version).toBe('2');
    expect(gone).toMatchObject({ reviewState: 'rejected', rejectReason: '더 이상 쓰지 않음' });
  });
  it('reject needs a reason (1..500), works from confirmed too, and a rejected row stays rejected', () => {
    const row = mapping('CHAMBER/START');
    expect(codes('conceptReject', { mappingId: row.id })).toEqual(['reason:required']);
    expect(codes('conceptReject', { mappingId: row.id, reason: '   ' })).toEqual(['reason:required']);
    expect(codes('conceptReject', { mappingId: row.id, reason: 'x'.repeat(501) })).toEqual(['reason:too_long']);
    expect(codes('conceptConfirm', { mappingId: 'x' })).toEqual(['mappingId:malformed']);
    expect(send('conceptReject', { mappingId: row.id, reason: '다름' }, '2').result?.version).toBe('3');
    expect(send('conceptReject', { mappingId: row.id, reason: '다름' }, '3')).toEqual({ invalid: ['mapping:already_rejected'] });
    expect(send('conceptConfirm', { mappingId: row.id }, '3')).toEqual({ invalid: ['mapping:already_rejected'] });
  });
  it('an unknown mapping has no version (the engine answers not_found)', () => {
    expect(action('conceptConfirm').version?.({ input: { mappingId: '00000009-0000-4000-8000-0000000000ff' }, actor: 'admin', scopeId: null })).toBeNull();
  });
  it('a rejected pair leaves the review queue and the suggestions never offer it again', () => {
    const [a, b] = ['ROBOT/MOVE'].flatMap(k => [mapping(k), mapping(k, pairModelId())]);
    send('conceptReject', { mappingId: a!.id, reason: '다름' }, '1');
    expect(read('conceptSuggestions', { modelId: A, kind: 'event' }).rows.some(r => r.source.targetKey === 'ROBOT/MOVE')).toBe(false);
    expect(b!.reviewState).toBe('proposed');
  });
});
