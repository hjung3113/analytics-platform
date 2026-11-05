import { describe, expect, it } from 'vitest';

import { conceptActions } from '../concept-actions.js';
import { conceptEndpoints } from '../concept-endpoints.js';
import { subjectEndpoints } from '../subject-endpoints.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const deps = { db: {} as never, checkService: {} as never };
const endpoints = [...conceptEndpoints(deps), ...subjectEndpoints(deps)];
const judge = (id: string, params: Record<string, unknown>) => endpoints.find((e) => e.spec.id === id)?.validate?.(params);

describe('concept and subject read declarations', () => {
  it('declares three reads on the models menu with the view right, no scope and no Context key', () => {
    expect(endpoints.map((e) => [e.spec.id, e.spec.menuId, e.spec.permission, e.spec.requiresScope, e.spec.context])).toEqual([
      ['logKnowledge.conceptMappings', 'log-knowledge-models', 'platform:view', false, {}],
      ['logKnowledge.conceptSuggestions', 'log-knowledge-models', 'platform:view', false, {}],
      ['logKnowledge.specSubjectItems', 'log-knowledge-models', 'platform:view', false, {}],
    ]);
  });

  it.each([
    ['logKnowledge.conceptMappings', {}, true],
    ['logKnowledge.conceptMappings', { modelId: UUID, conceptId: UUID, reviewState: 'confirmed', kind: 'event', page: 0, pageSize: 20 }, true],
    ['logKnowledge.conceptMappings', { reviewState: 'accepted' }, false],
    ['logKnowledge.conceptMappings', { kind: 'field' }, false],
    ['logKnowledge.conceptMappings', { modelId: 'x' }, false],
    ['logKnowledge.conceptMappings', { page: -1 }, false],
    ['logKnowledge.conceptMappings', { pageSize: 201 }, false],
    ['logKnowledge.conceptSuggestions', { modelId: UUID }, true],
    ['logKnowledge.conceptSuggestions', { modelId: UUID, kind: 'module', page: 1 }, true],
    ['logKnowledge.conceptSuggestions', {}, false],
    ['logKnowledge.conceptSuggestions', { modelId: UUID, kind: 'relation' }, false],
    ['logKnowledge.specSubjectItems', { modelId: UUID, targetKey: 'SPINDLE/START' }, true],
    ['logKnowledge.specSubjectItems', { modelId: UUID, targetKey: 'SPINDLE/START', page: 2, pageSize: 10 }, true],
    ['logKnowledge.specSubjectItems', { modelId: UUID }, false],
    ['logKnowledge.specSubjectItems', { modelId: UUID, targetKey: '  ' }, false],
    ['logKnowledge.specSubjectItems', { modelId: UUID, targetKey: 'x'.repeat(1201) }, false],
    ['logKnowledge.specSubjectItems', { targetKey: 'A' }, false],
  ])('%s %j -> ok=%s', (id, params, ok) => {
    expect(judge(id, params)?.ok).toBe(ok);
  });
});

describe('concept write declarations', () => {
  const actions = conceptActions({ checkService: {} as never });

  it('declares propose / confirm / reject on the models menu with the spec right (no new capability)', () => {
    expect(actions.map((a) => [a.spec.id, a.spec.menuId, a.spec.permission, a.spec.concurrency, a.spec.requiresScope])).toEqual([
      ['logKnowledge.conceptPropose', 'log-knowledge-models', 'knowledge:spec-publish', 'none', false],
      ['logKnowledge.conceptConfirm', 'log-knowledge-models', 'knowledge:spec-publish', 'version', false],
      ['logKnowledge.conceptReject', 'log-knowledge-models', 'knowledge:spec-publish', 'version', false],
    ]);
  });
});
