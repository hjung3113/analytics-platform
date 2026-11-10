import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { layoutRevision, type BindingsFile, type MappingConflict } from '@eqv/core';
import { DIRTY_REASON, derivePublishPlan, dryRun, type DryRun, type PlanInput } from '@eqv/editor';
import { FLEET_STATUSES } from '../endpoints';
import { FLEET_STATUS_LABEL, publishBlockReason, stepMarks, type StepFacts } from './onboarding';

const seed = <T,>(name: string): T => JSON.parse(readFileSync(join(process.cwd(), 'src/mock/onboarding', name), 'utf8')) as T;

describe('Fleet status words (ONBOARDING §1, §6)', () => {
  it.each([
    ['no-observations', '관측 없음'], ['unstarted', '미착수'], ['draft', '초안'], ['published', '게시됨'], ['drift', 'Drift'], ['drift-unknown', '게시됨 · Drift 미확인'],
  ] as const)('%s reads «%s»', (code, word) => {
    expect(FLEET_STATUS_LABEL[code]).toBe(word);
  });
  it('covers every code the Fleet read can answer', () => {
    expect(Object.keys(FLEET_STATUS_LABEL).sort()).toEqual([...FLEET_STATUSES].sort());
  });
});

describe('publish gate (D9, D10)', () => {
  let input: PlanInput;
  let run: DryRun;
  let revision: string;
  beforeAll(async () => {
    const inventory = seed<Record<string, PlanInput['inventory']>>('inventories.json')['23e9e214b396bfaa4539e7b30c5f8f9163fbac6c50201430231f641ff7c822ba']!;
    const rules = seed<Record<string, never>>('rules.json');
    const layout = seed<PlanInput['layout']>('layout-eq-synth-01.json');
    const bindings = seed<Record<string, BindingsFile>>('bindings.json')['eq-synth-01']!;
    const previous = seed<Record<string, Record<string, PlanInput['previous']>>>('mappings.json')['eq-synth-01']![bindings.bindings[1]!.mappingHash]!;
    input = {
      equipment: { equipmentId: 'eq-synth-01', maker: 'synth-maker', model: 'synth-model' }, inventory, layout,
      dictionaries: [seed<Record<string, never>>('dictionaries.json')['model/synth-maker/synth-model']!],
      ruleFiles: { model: rules['model/synth-maker/synth-model']!, equipment: rules['equipment/eq-synth-01']! },
      bindings, previous, effectiveFrom: '2026-01-01T10:30:00.000',
    };
    run = await dryRun(input);
    revision = await layoutRevision(layout);
  });
  const conflict: MappingConflict = { kind: 'transfer-without-capability', from: 'LP1', to: 'LLA', fromComponentId: 'lp-a', toComponentId: 'll-a', count: 3 };

  it('passes the saved synthetic rules, and Mapping Conflicts alone never block', () => {
    expect(publishBlockReason({ dirty: false, plan: derivePublishPlan(input, { run, revision }) })).toBeNull();
    const withConflicts = derivePublishPlan(input, { run: { ...run, conflicts: [conflict, conflict] }, revision });
    expect(withConflicts.diff.conflicts).toBe(2);
    expect(publishBlockReason({ dirty: false, plan: withConflicts })).toBeNull();
  });

  it.each([
    ['unsaved Board edits', () => ({ dirty: true, plan: derivePublishPlan(input, { run, revision }) }), DIRTY_REASON],
    ['a publishMapping issue', () => ({ dirty: false, plan: derivePublishPlan(input, { run: { mapping: null, issues: [{ code: 'same-level-overlap', path: ['PM2'], message: 'two rules' }], coverage: null, conflicts: [] }, revision }) }), /^규칙 문제 \(same-level-overlap\)/],
    ['an effectiveFrom that is not Site Wall-clock', () => ({ dirty: false, plan: derivePublishPlan({ ...input, effectiveFrom: '2026-01-01 10:30' }, { run, revision }) }), /^effectiveFrom 형식이 올바르지 않습니다/],
    ['an effectiveFrom not after the latest Binding', () => ({ dirty: false, plan: derivePublishPlan({ ...input, effectiveFrom: '2026-01-01T10:00:00.000' }, { run, revision }) }), /^effectiveFrom은 마지막 binding/],
    ['the same Mapping and Layout Revision as the latest Binding', () => {
      const latest = { layoutId: input.layout.id, mappingHash: run.mapping!.hash, layoutRevision: revision, effectiveFrom: '2026-01-01T10:20:00.000' };
      return { dirty: false, plan: derivePublishPlan({ ...input, bindings: { ...input.bindings!, bindings: [{ ...input.bindings!.bindings[0]!, effectiveTo: '2026-01-01T10:04:30.000' }, { ...input.bindings!.bindings[1]!, effectiveTo: '2026-01-01T10:20:00.000' }, latest] } }, { run, revision }) };
    }, '이전 게시와 같습니다'],
  ])('blocks on %s', (_name, gate, reason) => {
    const text = publishBlockReason(gate());
    if (typeof reason === 'string') expect(text).toBe(reason); else expect(text).toMatch(reason);
  });
});

describe('step marks', () => {
  const base: StepFacts = { windows: 1, aliases: 8, hasDraft: true, unmapped: 0, conflicts: 0, upToDate: false, drift: 'none' };
  it.each([
    ['all clear', base, { data: 'done', inventory: 'done', template: 'done', mapping: 'done', validate: null, drift: 'done' }],
    ['no window, no draft, unmapped aliases, Drift unknown', { ...base, windows: 0, hasDraft: false, unmapped: 1, drift: 'unknown' as const }, { data: 'attention', template: 'attention', mapping: 'attention', drift: 'attention' }],
    ['conflicts mark Mapping but never 검증·게시', { ...base, conflicts: 2 }, { mapping: 'attention', validate: null }],
    ['published and unchanged', { ...base, upToDate: true }, { validate: 'done' }],
    ['not published yet', { ...base, drift: 'unpublished' as const }, { drift: null }],
  ])('%s', (_name, facts, expected) => {
    expect(stepMarks(facts)).toMatchObject(expected);
  });
});
