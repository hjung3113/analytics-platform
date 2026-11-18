import { describe, expect, it } from 'vitest';
import { parseSearchAddress, plainQuery, recentKnowledgeTargets, SEARCH_KEY_RULES } from './searchModel';

describe('knowledge search address', () => {
  it('defaults to an idle all-kinds search', () => {
    expect(parseSearchAddress({})).toEqual({ params: { q: null, relation: null, kind: 'all', includeOpposite: false }, active: false });
  });

  it('keeps the query and closed-list options from the address', () => {
    expect(parseSearchAddress({ q: '  pump  ', kind: 'observed', opposite: 'true' })).toEqual({
      params: { q: '  pump  ', relation: null, kind: 'observed', includeOpposite: true }, active: true,
    });
  });

  it('activates and parses an explicit order relation', () => {
    const relation = JSON.stringify({ source: 'CHAMBER/STEP_PROCESS', predicate: 'after', target: 'CHAMBER/PROCESS_START' });
    expect(parseSearchAddress({ relation })).toEqual({
      params: { q: null, relation: { source: 'CHAMBER/STEP_PROCESS', predicate: 'after', target: 'CHAMBER/PROCESS_START' }, kind: 'all', includeOpposite: false }, active: true,
    });
  });

  it('rejects malformed and unknown address values through named key rules', () => {
    const rule = (key: string) => SEARCH_KEY_RULES.find(item => item.key === key)!;
    expect(rule('q').valid('x'.repeat(200))).toBe(true);
    expect(rule('q').valid('x'.repeat(201))).toBe(false);
    expect(rule('relation').valid('{')).toBe(false);
    expect(rule('kind').valid('constructor')).toBe(false);
    expect(rule('opposite').valid('yes')).toBe(false);
  });

  it('removes only a closed order operator from a three-token Event query', () => {
    expect(plainQuery('STEP_PROCESS before PROCESS_START')).toBe('STEP_PROCESS PROCESS_START');
    expect(plainQuery('pressure before rising edge')).toBe('pressure before rising edge');
  });
});

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
