import { describe, expect, it } from 'vitest';
import { recentKnowledgeTargets } from './searchModel';

describe('recent knowledge targets', () => {
  it('deduplicates Item IDs while keeping recency positions and counts model and spec visits', () => {
    const id = '00000005-0000-4000-8000-000000000001', model = '00000003-0000-4000-8000-000000000001';
    expect(recentKnowledgeTargets([
      { menuId: 'log-knowledge-item', url: `/log/knowledge/items/${id}?v=1`, at: 5 },
      { menuId: 'log-knowledge-spec', url: `/log/knowledge/models/${model}/spec?v=1`, at: 4 },
      { menuId: 'log-knowledge-item', url: `/log/knowledge/items/${id}`, at: 3 },
      { menuId: 'log-knowledge-model', url: `/log/knowledge/models/${model}`, at: 2 },
    ])).toEqual({ items: [{ id, visitIndexes: [0, 2] }], models: [{ id: model, visitIndex: 1 }, { id: model, visitIndex: 3 }] });
  });

  it('ignores malformed URLs, unrelated routes and invalid IDs', () => {
    expect(recentKnowledgeTargets([
      { menuId: 'log-knowledge-item', url: '/log/knowledge/items/not-an-id', at: 1 },
      { menuId: 'log-knowledge-model', url: '::bad url', at: 2 },
      { menuId: 'log-knowledge-items', url: '/log/knowledge/items/00000005-0000-4000-8000-000000000001', at: 3 },
    ])).toEqual({ items: [], models: [] });
  });
});
