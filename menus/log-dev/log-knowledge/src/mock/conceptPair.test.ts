import { beforeEach, expect, it } from 'vitest';
import { MockActionInvalid } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';
import { conceptPairPlan, type ConceptMappingRow, type ConceptProposeInput, type ConceptSuggestion } from '../endpoints';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog } from './index';
import { allMappings, resetConcepts } from './conceptStore';
import { latestSpec, pairModelId, resetSpecs, SPEC_MODEL, specId, specRevisions } from './specStore';
import { all, insert } from './store';
const read = (params: Record<string, unknown>) => logKnowledgeMock.find(x => x.spec.id === 'logKnowledge.conceptMappings')!.handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' } as never) as { rows: ConceptMappingRow[]; total: number };
function send(id: string, input: unknown) {
  const handler = logKnowledgeActionsMock.find(x => x.spec.id === `logKnowledge.${id}`)!;
  expect(handler.validate?.(input) ?? []).toEqual([]);
  try { return handler.handle({ input, actor: 'admin', scopeId: null } as never) as { data: { conceptId: string; mappingId: string; pairMappingId?: string } }; }
  catch (error) { if (error instanceof MockActionInvalid) throw new Error(error.fieldErrors.map(x => `${x.path.join('.')}:${x.code}`).join(', ')); throw error; }
}
beforeEach(() => { resetCatalog(); resetSpecs(); resetConcepts(); });
it.each(['confirm', 'reject'] as const)('after A–B confirmation, A–C can %s without rewriting A–B or other decisions', action => {
  const c = insert('model', 'C-10', 'C model', all('vendor')[0]!.id);
  const template = latestSpec(pairModelId())!;
  specRevisions().push({ ...template, revision: { ...template.revision, id: specId(), modelId: c.id } });
  const suggestion = (other: string): ConceptSuggestion => ({ kind: 'module', source: { modelId: SPEC_MODEL, targetKey: 'ROBOT', name: 'Robot' }, candidate: { modelId: other, modelName: 'Other', targetKey: 'ROBOT', name: 'Robot' }, proposal: true, score: 1, basis: { name_trgm: 1 } });
  const decide = (s: ConceptSuggestion, decision: 'confirm' | 'reject') => {
    const plan = conceptPairPlan(s, [...read({ modelId: SPEC_MODEL }).rows, ...read({ modelId: s.candidate.modelId }).rows]);
    const target = (t: typeof s.source) => ({ modelId: t.modelId, targetKind: s.kind, target: { module: t.name } });
    const first = plan.missing[0];
    const saved = first ? send('conceptPropose', { ...target(first), ...(plan.conceptId ? { conceptId: plan.conceptId } : { canonicalLabel: s.source.name }), relationKind: 'equivalent', ...(plan.missing[1] ? { pairWith: target(plan.missing[1]) } : {}) } satisfies ConceptProposeInput).data : null;
    const ids = new Set([...plan.existing.filter(r => r.reviewState === 'proposed').map(r => r.id), saved?.mappingId, saved?.pairMappingId]);
    for (const row of read({ conceptId: saved?.conceptId ?? plan.conceptId }).rows.filter(r => ids.has(r.id))) send(decision === 'confirm' ? 'conceptConfirm' : 'conceptReject', { mappingId: row.id, ...(decision === 'reject' ? { reason: 'different condition' } : {}) });
  };
  const unrelated = structuredClone(allMappings());
  decide(suggestion(pairModelId()), 'confirm');
  const pair = structuredClone(allMappings().filter(r => r.targetKind === 'module'));
  expect(pair).toHaveLength(2); expect(pair.every(r => r.reviewState === 'confirmed')).toBe(true);
  decide(suggestion(c.id), action);
  expect(allMappings().find(r => r.modelId === c.id && r.targetKey === 'ROBOT')?.reviewState).toBe(action === 'confirm' ? 'confirmed' : 'rejected');
  expect(allMappings().filter(r => pair.some(p => p.id === r.id))).toEqual(pair);
  expect(allMappings().filter(r => unrelated.some(p => p.id === r.id))).toEqual(unrelated);
});
