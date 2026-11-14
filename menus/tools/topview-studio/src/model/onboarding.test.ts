import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { layoutRevision, type BindingsFile, type MappingConflict } from '@eqv/core';
import { DIRTY_REASON, derivePublishPlan, dryRun, type DryRun, type PlanInput } from '@eqv/editor';
import { FLEET_STATUSES } from '../endpoints';
import { FLEET_STATUS_LABEL, importProblemHint, importProblemLines, importRefusalProblems, publishBlockReason, publishHeaderReason, publishRightReason, rangeShort, stepMarks, wallClockShort, windowLabel, type StepFacts } from './onboarding';

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

  it.each(['staged', 'replaced', 'retired'])('a %s window blocks publish with its reason; an active one does not', (windowState) => {
    const plan = derivePublishPlan(input, { run, revision });
    expect(publishBlockReason({ dirty: false, plan, windowState })).toBe('게시 조건: 활성 Sample Window');
    expect(publishBlockReason({ dirty: false, plan, windowState: 'active' })).toBeNull();
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

describe('short Site Wall-clock for tight places (the full value goes in `title`)', () => {
  it.each([
    ['2026-01-01T10:04:30.000', '2026-01-01 10:04'],
    ['not a wall clock', 'not a wall clock'],
  ])('%s → %s', (value, short) => { expect(wallClockShort(value)).toBe(short); });
  it.each([
    ['same day', '2026-01-01T10:00:00.000', '2026-01-01T10:30:00.000', '2026-01-01 10:00–10:30'],
    ['two days', '2026-01-01T23:00:00.000', '2026-01-02T01:00:00.000', '2026-01-01 23:00 – 2026-01-02 01:00'],
  ])('a range on %s', (_name, from, to, short) => { expect(rangeShort(from, to)).toBe(short); });
  it('a window label leads with what differs between windows of the same range: generation, then state', () => {
    expect(windowLabel({ from: '2026-01-01T10:00:00.000', to: '2026-01-01T10:30:00.000', dataGeneration: 'g2', state: 'staged' })).toBe('g2 · 교체 대기 · 2026-01-01 10:00–10:30');
  });
});

describe('publish gate wording', () => {
  it('«이전 게시와 같습니다» outranks an empty effectiveFrom: right after a publish nothing new is left to publish', () => {
    const plan = { problems: ['effectiveFrom 형식이 올바르지 않습니다 (YYYY-MM-DDTHH:mm:ss.sss)', '이전 게시와 같습니다'] } as Parameters<typeof publishBlockReason>[0]['plan'];
    expect(publishBlockReason({ dirty: false, plan })).toBe('이전 게시와 같습니다');
  });
  it.each([
    ['effectiveFrom 형식이 올바르지 않습니다 (YYYY-MM-DDTHH:mm:ss.sss)', 'effectiveFrom 확인 필요'],
    ['effectiveFrom은 마지막 binding의 effectiveFrom(2026-01-01T10:04:30.000)보다 늦어야 합니다', 'effectiveFrom 확인 필요'],
    ['이전 게시와 같습니다', '이전 게시와 같습니다'],
  ])('the header line for «%s» is «%s»', (problem, header) => { expect(publishHeaderReason(problem)).toBe(header); });
  it.each([
    ['a Revision exists', { canLayoutPublish: false, needsRevision: false }, null],
    ['layout-publish held', { canLayoutPublish: true, needsRevision: true }, null],
    ['the Revision must be published first without layout-publish', { canLayoutPublish: false, needsRevision: true }, /eqv-studio:layout-publish/],
    ['the Revision list is not read yet, without layout-publish', { canLayoutPublish: false, needsRevision: null }, /확인하는 중/],
  ])('rights: %s', (_name, input, reason) => {
    const text = publishRightReason(input);
    if (reason === null) expect(text).toBeNull(); else expect(text).toMatch(reason);
  });
});

describe('import problem words (#1658 import PR)', () => {
  it('groups one code across Occurrences into one Korean line with a count; paths and messages stay in the details', () => {
    const issues = [0, 1, 2].map((i) => ({ code: 'generation-mismatch', path: ['occurrences', i, 'source', 'dataGeneration'], message: `occurrences[${i}] must match` }));
    const lines = importProblemLines(issues, { dataGeneration: 'g2' });
    expect(lines).toEqual([{ code: 'generation-mismatch', text: '이벤트 3건의 Generation이 파일의 Generation(g2)과 다릅니다.', details: issues.map((p) => `generation-mismatch · ${p.path.join('.')} · ${p.message}`) }]);
  });
  it('turns every schema failure into one line', () => {
    const lines = importProblemLines(['equipmentId', 'from', 'to'].map((key) => ({ code: 'schema', path: [key], message: 'Invalid input' })));
    expect(lines.map((l) => l.text)).toEqual(['Sample Window(batch) 파일 형식 필요']);
    expect(lines[0]!.details).toHaveLength(3);
  });
  it('words a code it does not know without hiding it', () => {
    expect(importProblemLines([{ code: 'new-code', path: [] }])[0]!.text).toBe('확인하지 못한 문제입니다(new-code).');
  });
  it('words reversed-seq per Occurrence', () => {
    const issues = [1, 4].map((i) => ({ code: 'reversed-seq', path: ['occurrences', i, 'end', 'seq'], message: `occurrences[${i}].end.seq must be greater` }));
    expect(importProblemLines(issues).map((l) => l.text)).toEqual(['이벤트 2건의 끝 Record Sequence가 시작보다 앞섭니다.']);
  });
  it.each([
    [[{ path: ['file'], code: 'staged_exists' }], '같은 구간에 교체 대기 window가 이미 있습니다.', '데이터 탭에서 교체 대기 window를 먼저 «교체»한 뒤 가져오세요.'],
    [[{ path: ['file'], code: 'retired' }], '퇴역한 window와 같은 내용입니다.', '퇴역한 window는 다시 가져올 수 없습니다. 다른 파일을 고르세요.'],
    [[{ path: ['uploadId'], code: 'not_found' }], '올린 파일을 찾을 수 없습니다.', '파일을 다시 고르세요.'],
    [[{ path: ['file'], code: 'not_json' }], 'JSON으로 읽을 수 없습니다.', '원천 변환기가 만든 *.batch.json 파일을 고르세요.'],
    [[{ path: ['file', 'from'], code: 'window-overlap' }], '이미 있는 window와 구간이 겹칩니다.', '이 설비의 window와 겹치지 않고 timeDomain이 같은 파일을 고르세요.'],
  ])('maps the server refusal %j to a line and a hint', (fieldErrors, text, hint) => {
    const problems = importRefusalProblems(fieldErrors);
    expect(importProblemLines(problems).map((l) => l.text)).toEqual([text]);
    expect(importProblemHint(problems, { equipmentId: 'eq-1', fileEquipmentId: null })).toBe(hint);
  });
  it('the hint of another equipment\'s file names both equipment', () => {
    expect(importProblemHint([{ code: 'equipment-mismatch', path: ['equipmentId'] }, { code: 'record-owner', path: ['occurrences', 0, 'equipmentId'] }], { equipmentId: 'eq-ux-01', fileEquipmentId: 'eq-synth-03' }))
      .toBe('이 파일은 eq-synth-03의 Sample Window입니다. eq-ux-01의 파일을 고르세요.');
  });
});
