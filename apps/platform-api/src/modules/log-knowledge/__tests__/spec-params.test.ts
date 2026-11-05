import { describe, expect, it } from 'vitest';

import { specEndpoints } from '../spec-endpoints.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const endpoints = specEndpoints({ db: {} as never, checkService: {} as never });
const judge = (id: string, params: Record<string, unknown>) => endpoints.find((e) => e.spec.id === id)?.validate?.(params);

describe('model spec read declarations', () => {
  it('declares four reads on the models menu, no scope and no Context key; the draft read needs the spec right', () => {
    expect(endpoints.map((e) => [e.spec.id, e.spec.menuId, e.spec.permission, e.spec.requiresScope, e.spec.context])).toEqual([
      ['logKnowledge.modelSpec', 'log-knowledge-models', 'platform:view', false, {}],
      ['logKnowledge.modelSpecRevisions', 'log-knowledge-models', 'platform:view', false, {}],
      ['logKnowledge.specDraft', 'log-knowledge-models', 'knowledge:spec-publish', false, {}],
      ['logKnowledge.specChanges', 'log-knowledge-models', 'platform:view', false, {}],
    ]);
    expect(endpoints.map((e) => [...e.spec.paramKeys].sort())).toEqual([
      ['modelId', 'softwareId'],
      ['modelId', 'page', 'pageSize'],
      ['revisionId'],
      ['modelId', 'needsRevalidation', 'page', 'pageSize', 'softwareId', 'status'].sort(),
    ]);
  });

  it.each([
    ['logKnowledge.modelSpec', { modelId: UUID }, true],
    ['logKnowledge.modelSpec', {}, false],
    ['logKnowledge.modelSpec', { modelId: 'x' }, false],
    ['logKnowledge.modelSpec', { modelId: null }, false],
    ['logKnowledge.modelSpecRevisions', { modelId: UUID }, true],
    ['logKnowledge.modelSpecRevisions', { modelId: UUID, page: 2, pageSize: 200 }, true],
    ['logKnowledge.modelSpecRevisions', { modelId: UUID, pageSize: 201 }, false],
    ['logKnowledge.modelSpecRevisions', { modelId: UUID, pageSize: 0 }, false],
    ['logKnowledge.modelSpecRevisions', { modelId: UUID, page: -1 }, false],
    ['logKnowledge.modelSpecRevisions', { modelId: UUID, page: '1' }, false],
    ['logKnowledge.modelSpecRevisions', {}, false],
    ['logKnowledge.modelSpec', { modelId: UUID, softwareId: UUID }, true],
    ['logKnowledge.modelSpec', { modelId: UUID, softwareId: 'x' }, false],
    ['logKnowledge.specChanges', { modelId: UUID }, true],
    ['logKnowledge.specChanges', { modelId: UUID, softwareId: UUID, needsRevalidation: true, status: 'all', page: 1, pageSize: 20 }, true],
    ['logKnowledge.specChanges', { modelId: UUID, status: 'closed' }, false],
    ['logKnowledge.specChanges', { modelId: UUID, needsRevalidation: 'yes' }, false],
    ['logKnowledge.specChanges', { modelId: UUID, softwareId: 'x' }, false],
    ['logKnowledge.specChanges', { modelId: UUID, pageSize: 201 }, false],
    ['logKnowledge.specChanges', {}, false],
    ['logKnowledge.specDraft', { revisionId: UUID }, true],
    ['logKnowledge.specDraft', { revisionId: 'x' }, false],
    ['logKnowledge.specDraft', { modelId: UUID }, false],
  ])('%s %j -> ok=%s', (id, params, ok) => {
    expect(judge(id, params)?.ok).toBe(ok);
  });
});
