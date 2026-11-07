import { describe, expect, it, vi } from 'vitest';
import type { ActionResult, ApiResponse } from '@ap/contracts';
import type { ImportApplyCounts, ImportApplyResult, ImportDetail, ImportRowView } from '../../endpoints';
import {
  APPLY_ERROR_CODES, APPLY_ERROR_SENTENCE, APPLY_FALLBACK, PASTE_REFUSAL_CODES, PLAN_ERROR_CODES, PLAN_ERROR_SENTENCE, PLAN_FALLBACK, applyErrorText,
  cellOf, conflictKind, conflictText, countNewParents, fetchAllRows, nextStep, pasteRefusalText, previousStep, resolveInBatches, rowErrorText, runApplyLoop, stepSkipped,
} from './importModel';

/** Every code the contract lists for a row (docs/architecture/platform-api/api/log-knowledge.md §import): this list fails the build when a code is added without a sentence. */
const CONTRACT_PLAN_CODES = [
  'required', 'malformed', 'too_long', 'duplicate', 'not_found', 'inactive', 'parent_missing', 'parent_inactive', 'process_missing', 'process_inactive',
  'duplicate_in_file', 'ambiguous_name', 'ambiguous_parent', 'formula', 'merged', 'unsupported_cell',
];
const CONTRACT_APPLY_CODES = [
  'plan_changed', 'parent_missing', 'parent_inactive', 'process_missing', 'process_inactive', 'ambiguous_parent', 'taken', 'stale_target', 'target_missing', 'inactive_target', 'identity_conflict', 'unexpected',
];
const CONTRACT_PASTE_CODES = [
  'missing_header', 'duplicate_header', 'invalid_headers', 'empty', 'too_many_columns', 'unreadable', 'too_many_rows', 'file_too_large', 'required', 'busy',
];

describe('code to sentence maps', () => {
  it.each(CONTRACT_PLAN_CODES)('row code %s has a Korean sentence', code => {
    expect(PLAN_ERROR_SENTENCE[code]).toMatch(/[가-힣]/);
    expect(rowErrorText({ field: 'model_name', code })).not.toContain(code);
  });
  it('maps no code the contract does not list', () => expect([...PLAN_ERROR_CODES].sort()).toEqual([...CONTRACT_PLAN_CODES].sort()));
  it.each(CONTRACT_APPLY_CODES)('apply code %s has a Korean sentence', code => expect(applyErrorText(code)).not.toBe(APPLY_FALLBACK));
  it('maps no apply code the contract does not list', () => expect([...APPLY_ERROR_CODES].sort()).toEqual([...CONTRACT_APPLY_CODES].sort()));
  it.each(CONTRACT_PASTE_CODES)('paste refusal %s has a sentence', code => {
    expect(PASTE_REFUSAL_CODES).toContain(code);
    expect(pasteRefusalText([{ path: ['text'], code }]).text).not.toContain(code);
  });
  it('never shows a raw code, even for an unknown one', () => {
    expect(rowErrorText({ field: 'vendor_name', code: 'brand_new_code' })).toBe(`‘설비사명’ ${PLAN_FALLBACK}`);
    expect(applyErrorText('brand_new_code')).toBe(APPLY_FALLBACK);
    expect(pasteRefusalText([{ path: ['text'], code: 'brand_new_code' }]).text).not.toContain('brand_new_code');
    expect(Object.keys(APPLY_ERROR_SENTENCE)).toEqual(expect.arrayContaining(['taken']));
  });
  it('names the column of a row error in the owner\'s words', () => expect(rowErrorText({ field: 'model_name', code: 'duplicate_in_file' })).toContain('‘모델명’'));
});

describe('paste refusal mapping', () => {
  it('names the missing header', () => {
    const { text, busy } = pasteRefusalText([{ path: ['text'], code: 'missing_header' }, { path: ['text', 'headers', '모델명'], code: 'missing_header' }]);
    expect(text).toContain('‘모델명’ 머리글이 없습니다');
    expect(busy).toBe(false);
  });
  it('names every colliding header', () => {
    const { text } = pasteRefusalText([{ path: ['text'], code: 'duplicate_header' }, { path: ['text', 'headers', '모델'], code: 'duplicate_header' }, { path: ['text', 'headers', '모델명'], code: 'duplicate_header' }]);
    expect(text).toContain('‘모델’');
    expect(text).toContain('‘모델명’');
  });
  it('treats busy as retry-later', () => expect(pasteRefusalText([{ path: ['text'], code: 'busy' }])).toEqual({ text: '잠시 후 다시 시도하세요.', busy: true }));
});

describe('steps', () => {
  it('skips step 3 without conflicts', () => {
    expect(stepSkipped(3, 0)).toBe(true);
    expect(stepSkipped(3, 2)).toBe(false);
    expect(stepSkipped(2, 0)).toBe(false);
    expect(nextStep(2, 0)).toBe(4);
    expect(nextStep(2, 1)).toBe(3);
    expect(previousStep(4, 0)).toBe(2);
    expect(previousStep(4, 1)).toBe(3);
  });
});

const row = (over: Partial<ImportRowView> = {}): ImportRowView => ({
  rowNo: 1, raw: {}, normalized: null, errors: [], planState: 'new', targetId: null, targetVersion: null, resolution: null, mapTargetId: null,
  applyStatus: null, applyError: null, resultTargetId: null, creates: null, ...over,
});

describe('conflict kinds', () => {
  it.each([
    ['ambiguous_name', row({ planState: 'conflict', errors: [{ field: 'model_code', code: 'ambiguous_name' }] })],
    ['ambiguous_parent', row({ planState: 'conflict', errors: [{ field: 'vendor_name', code: 'ambiguous_parent' }] })],
    ['parent_inactive', row({ planState: 'conflict', errors: [{ field: 'process_names', code: 'parent_inactive' }] })],
    ['inactive_model', row({ planState: 'conflict', targetId: 'abc', errors: [] })],
  ] as const)('%s', (kind, r) => {
    expect(conflictKind(r)).toBe(kind);
    expect(conflictText(r).fix).toContain('다시 검사');
  });
  it('explains reactivation for an inactive model and for an inactive parent', () => {
    expect(conflictText(row({ targetId: 'x' })).fix).toContain('다시 활성화');
    expect(conflictText(row({ errors: [{ field: 'vendor_name', code: 'parent_inactive' }] })).fix).toContain('다시 활성화');
  });
});

describe('cellOf', () => {
  it('reads by the job mapping, then by alias', () => {
    expect(cellOf({ raw: { 제조사: 'A' } }, 'vendor', { vendor_name: '제조사' })).toBe('A');
    expect(cellOf({ raw: { ' 모델 ': 'M' } }, 'model', null)).toBe('M');
    expect(cellOf({ raw: {} }, 'process', null)).toBe('');
  });
});

describe('new parents', () => {
  it('counts a parent once across rows and pages, by the server key', () => {
    const rows = [
      row({ creates: { vendor: 'Delta Corp', processes: ['Dry Clean', 'Etch2'] } }),
      row({ rowNo: 2, creates: { vendor: ' delta  corp ', processes: ['DRY CLEAN'] } }),
      row({ rowNo: 3, planState: 'update', creates: { processes: ['etch2', 'Strip'] } }),
      row({ rowNo: 4, planState: 'conflict', creates: { vendor: 'Ghost', processes: ['Nope'] } }),
      row({ rowNo: 5, creates: null }),
    ];
    expect(countNewParents(rows)).toEqual({ vendors: 1, processes: 3 });
  });
});

const ok = (data: unknown): ApiResponse<ImportDetail> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'c' }) as ApiResponse<ImportDetail>;
const counts: ImportApplyCounts = { applied: 0, unchanged: 0, skipped: 0, excluded: 0, unresolved: 0, conflict: 0, failed: 0, remaining: 0 };

describe('fetchAllRows', () => {
  it('reads every page, not only the first', async () => {
    const total = 450;
    const detail = (page: number, size: number): ImportDetail => ({
      job: { id: 'j', rowVersion: 3, planVersion: 2 } as ImportDetail['job'],
      rows: Array.from({ length: Math.max(0, Math.min(size, total - page * size)) }, (_, i) => row({ rowNo: page * size + i + 1 })), total, applyCounts: counts,
    });
    const fetchPage = vi.fn(async ({ page, pageSize }: { page: number; pageSize: number }) => ok(detail(page, pageSize)));
    const all = await fetchAllRows(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(all.ok && all.rows.map(r => r.rowNo)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(fetchPage.mock.calls.every(([p]) => p.pageSize === 200)).toBe(true);
  });
  it('stops at the first refusal', async () => {
    const fetchPage = vi.fn(async () => ({ outcome: 'error', data: null }) as ApiResponse<ImportDetail>);
    expect(await fetchAllRows(fetchPage)).toEqual({ ok: false, outcome: 'error' });
  });
});

type Resolve = Parameters<typeof resolveInBatches>[0];
const done = (version: string, planVersion = 5) => ({ outcome: 'ok', data: { jobId: 'j', status: 'review_required', planVersion, resolved: 0 }, version, fieldErrors: [], replayed: false, correlationId: 'c' }) as unknown as ActionResult<never>;

describe('resolveInBatches', () => {
  it('sends batches of at most 500 and carries the version of the previous answer', async () => {
    const calls: { size: number; version: string }[] = [];
    const run: Resolve = async (input, options) => {
      calls.push({ size: input.resolutions.length, version: options.expectedVersion });
      return done(String(Number(options.expectedVersion) + 1)) as never;
    };
    const end = await resolveInBatches(run, 'j', Array.from({ length: 1201 }, (_, i) => i + 1), '7');
    expect(calls).toEqual([{ size: 500, version: '7' }, { size: 500, version: '8' }, { size: 201, version: '9' }]);
    expect(end).toEqual({ ok: true, version: '10', planVersion: 5 });
  });
  it('stops on a stale version and hands back the server\'s current one', async () => {
    let n = 0;
    const run: Resolve = async () => (++n === 1 ? done('8') : { ...done('8'), outcome: 'conflict', version: '12' }) as never;
    const end = await resolveInBatches(run, 'j', Array.from({ length: 700 }, (_, i) => i + 1), '7');
    expect(end).toEqual({ ok: false, outcome: 'conflict', version: '12', done: 500 });
    expect(n).toBe(2);
  });
});

const progress = (status: string, remaining: number, planVersion = 2): ActionResult<ImportApplyResult> =>
  ({ outcome: 'ok', data: { outcome: 'progress', jobId: 'j', status, planVersion, remaining, counts: { ...counts, remaining } }, version: null, fieldErrors: [], replayed: false, correlationId: 'c' }) as ActionResult<ImportApplyResult>;
const answer = (data: ImportApplyResult): ActionResult<ImportApplyResult> => ({ outcome: 'ok', data, version: null, fieldErrors: [], replayed: false, correlationId: 'c' });
const wait = vi.fn(async () => undefined);

describe('runApplyLoop', () => {
  it('applies with fresh calls until completed, reporting progress and sending the latest plan version', async () => {
    const answers = [progress('applying', 80, 2), progress('applying', 40, 3), progress('completed', 0, 3)];
    const step = vi.fn(async () => answers.shift()!);
    const seen: number[] = [];
    const end = await runApplyLoop({ step, planVersion: 2, wait, onProgress: p => seen.push(p.remaining) });
    expect(end).toMatchObject({ kind: 'done', status: 'completed' });
    expect(step.mock.calls.map(c => (c as unknown[])[0])).toEqual([2, 2, 3]);
    expect(seen).toEqual([80, 40, 0]);
  });
  it('ends on partial_failure and does not call again', async () => {
    const step = vi.fn(async () => progress('partial_failure', 0));
    expect(await runApplyLoop({ step, planVersion: 1, wait })).toMatchObject({ kind: 'done', status: 'partial_failure' });
    expect(step).toHaveBeenCalledTimes(1);
  });
  it('a new loop after partial_failure is one more fresh call that retries the failed rows', async () => {
    const step = vi.fn().mockResolvedValueOnce(progress('completed', 0));
    expect(await runApplyLoop({ step, planVersion: 4, wait })).toMatchObject({ kind: 'done', status: 'completed' });
    expect(step).toHaveBeenCalledWith(4);
  });
  it('backs off 2 s on busy and continues', async () => {
    const waits = vi.fn(async () => undefined);
    const answers = [answer({ outcome: 'busy' }), answer({ outcome: 'busy' }), progress('completed', 0)];
    const step = vi.fn(async () => answers.shift()!);
    expect(await runApplyLoop({ step, planVersion: 1, wait: waits })).toMatchObject({ kind: 'done' });
    expect(waits.mock.calls).toEqual([[2000], [2000]]);
  });
  it('gives up after 30 busy answers in a row', async () => {
    const step = vi.fn(async () => answer({ outcome: 'busy' }));
    expect(await runApplyLoop({ step, planVersion: 1, wait })).toEqual({ kind: 'busy' });
    expect(step).toHaveBeenCalledTimes(30);
  });
  it('resets the busy count after progress', async () => {
    const answers = [...Array.from({ length: 20 }, () => answer({ outcome: 'busy' })), progress('applying', 5), ...Array.from({ length: 20 }, () => answer({ outcome: 'busy' })), progress('completed', 0)];
    const step = vi.fn(async () => answers.shift()!);
    expect(await runApplyLoop({ step, planVersion: 1, wait })).toMatchObject({ kind: 'done' });
  });
  it.each(['plan_version', 'state'] as const)('stops on a %s conflict without another call', async reason => {
    const step = vi.fn(async () => answer({ outcome: 'conflict', reason }));
    expect(await runApplyLoop({ step, planVersion: 1, wait })).toEqual({ kind: 'conflict', reason });
    expect(step).toHaveBeenCalledTimes(1);
  });
  it('stops on not_found', async () => expect(await runApplyLoop({ step: async () => answer({ outcome: 'not_found' }), planVersion: 1, wait })).toEqual({ kind: 'not_found' }));
  it('resends an unknown answer with its own retry, then fails', async () => {
    const retry = vi.fn(async (): Promise<ActionResult<ImportApplyResult>> => progress('completed', 0));
    const step = vi.fn(async () => ({ ...answer({ outcome: 'busy' }), outcome: 'unknown', data: null, retry }) as ActionResult<ImportApplyResult>);
    expect(await runApplyLoop({ step, planVersion: 1, wait })).toMatchObject({ kind: 'done' });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(await runApplyLoop({ step: async () => ({ ...answer({ outcome: 'busy' }), outcome: 'error', data: null }) as ActionResult<ImportApplyResult>, planVersion: 1, wait })).toEqual({ kind: 'failed' });
  });
  it('stops when remaining never shrinks instead of spinning', async () => {
    const step = vi.fn(async () => progress('applying', 9));
    expect(await runApplyLoop({ step, planVersion: 1, wait })).toEqual({ kind: 'stalled' });
    expect(step.mock.calls.length).toBeLessThan(10);
  });
  it('honours a stop request before the next call', async () => {
    const step = vi.fn(async () => progress('applying', 9));
    expect(await runApplyLoop({ step, planVersion: 1, wait, shouldStop: () => true })).toEqual({ kind: 'aborted' });
    expect(step).not.toHaveBeenCalled();
  });
});
