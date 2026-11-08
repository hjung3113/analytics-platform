import { describe, expect, it } from 'vitest';
import { logRulesMock, FIXTURE_MODELS } from './index';

const endpoint = (name: string) => logRulesMock.find(e => e.spec.id === `logRules.${name}`)!;
const run = (name: string, params: Record<string, unknown> = {}) => endpoint(name).handle({ params } as never) as Record<string, unknown> | null;

describe('synthetic validation catalog', () => {
  it('labels its source and supplies two RuleSets, ordered Revision diffs and a retired Revision', () => {
    expect(run('catalogStatus')).toMatchObject({ received: true, sourceSystem: 'synthetic-validator · 합성 fixture' });
    expect(run('ruleSets')).toMatchObject({ total: 2 });
    expect(run('ruleSetDetail', { ruleSetKey: 'core' })).toMatchObject({ revisions: [expect.objectContaining({ retired: true }), expect.objectContaining({ changes: expect.objectContaining({ addedCount: 1, removedCount: 1, supportChangedCount: 1 }) })] });
  });
  it('preserves target formats and text and distinguishes absent requirement declarations', () => {
    expect(run('ruleDetail', { ruleSetKey: 'core', ruleKey: 'R-001' })).toMatchObject({ targets: [expect.objectContaining({ format: 'event', requirementIds: [] })] });
    expect(run('ruleDetail', { ruleSetKey: 'unknown', ruleKey: 'R-001' })).toBeNull();
  });
  it('filters before paging and sorts deterministically, treating target substrings literally', () => {
    expect(run('rules', { filters: [{ id: 'support', op: 'in', value: ['partial'] }] })).toMatchObject({ rows: expect.arrayContaining([expect.objectContaining({ support: 'partial' })]), total: 2 });
    expect(run('rules', { targetQ: 'does-not-exist' })).toMatchObject({ rows: [], total: 0 });
    expect(run('rules', { filters: [{ id: 'requirementIds', op: 'isEmpty' }] })).toMatchObject({ rows: expect.arrayContaining([expect.objectContaining({ requirementIdCount: 0 })]), total: 2 });
  });
  it.each(['support', 'scope', 'requirementIds', 'ruleSetKey'])('rejects malformed %s filters and unknown sorts', id => {
    expect(endpoint('rules').validate?.({ params: { filters: [{ id, op: 'bogus' }] } } as never)).toBeTruthy();
    expect(endpoint('rules').validate?.({ params: { sorting: [{ id: 'bogus', desc: false }] } } as never)).toBeTruthy();
  });
  it('accepts translated target search plus wire filters and rejects the UI-only field on the wire', () => {
    expect(endpoint('rules').validate?.({ params: { targetQ: 'robot', filters: [{ id: 'support', op: 'in', value: ['partial'] }] } } as never)).toBeNull();
    expect(endpoint('rules').validate?.({ params: { filters: [{ id: 'targetCount', op: 'contains', value: 'robot' }] } } as never)).toBeTruthy();
  });
  it.each([['support', 'bogus'], ['ruleSetKey', ''], ['ruleSetKey', ' '.repeat(2)], ['ruleSetKey', 'a'.repeat(201)]])('rejects invalid %s values', (id, value) => {
    expect(endpoint('rules').validate?.({ params: { filters: [{ id, op: 'in', value: [value] }] } } as never)).toBeTruthy();
  });
  it('provides coverage reasons and 100% fixtures without turning unknown models into empty coverage', () => {
    expect(run('coverage', { modelId: FIXTURE_MODELS.noSpec })).toMatchObject({ computable: false, reason: 'no_spec' });
    expect(run('coverage', { modelId: FIXTURE_MODELS.noIds })).toMatchObject({ computable: false, reason: 'no_requirement_ids' });
    expect(run('coverage', { modelId: FIXTURE_MODELS.full })).toMatchObject({ computable: true, counts: { covered: 3, total: 3 } });
    expect(run('coverage', { modelId: '00000000-0000-4000-8000-000000000099' })).toBeNull();
  });
  it('lists every current declaring Rule with its actual support and Revision', () => {
    const rows = (run('coverage', { modelId: FIXTURE_MODELS.mixed }) as { rows: { key: string; declaredCount: number; declaredBy: { ruleSetKey: string; ruleKey: string; revision: string; support: string }[] }[] }).rows;
    const catalog = (run('rules') as { rows: { ruleSetKey: string; ruleKey: string }[] }).rows;
    for (const row of rows) {
      const actual = catalog.map(rule => run('ruleDetail', rule) as { targets: { requirementIds: string[] }[]; ruleSetKey: string; ruleKey: string; revision: string; support: string }).filter(rule => rule.targets.some(t => t.requirementIds.includes(row.key)));
      expect(row.declaredBy).toEqual(actual.map(({ ruleSetKey, ruleKey, revision, support }) => ({ ruleSetKey, ruleKey, revision, support })));
      expect(row.declaredCount).toBe(actual.length);
    }
  });
  it('does not reuse model coverage for an unknown software version', () => {
    expect(run('coverage', { modelId: FIXTURE_MODELS.mixed, softwareId: '00000004-0000-4000-8000-000000000099' })).toBeNull();
  });
  it('orders no_rule first, paginates, and keeps complete counts on every page', () => {
    expect(run('coverage', { modelId: FIXTURE_MODELS.mixed, pageSize: 1 })).toMatchObject({ rows: [expect.objectContaining({ state: 'no_rule' })], total: 5, counts: { total: 5 } });
    expect(run('coverageSummary', { modelIds: [FIXTURE_MODELS.noSpec, FIXTURE_MODELS.full] })).toMatchObject({ rows: [expect.objectContaining({ reason: 'no_spec' }), expect.objectContaining({ computable: true })] });
  });
});
