import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldError } from '@ap/contracts';
import type { AnyMockAction } from '@ap/mock-server';
import { importDetailEndpoint, type ImportDetail } from '../endpoints';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog, resetImports } from './index';
import { MOCK_APPLY_BATCH } from './imports';
import { all } from './store';

type Row = Record<string, unknown>;
const action = (id: string): AnyMockAction => logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${id}`)!;
const errors = (id: string, input: Row): string[] => (action(id).validate?.(input) ?? []).map((e: FieldError) => `${e.path.join('.')}:${e.code}`);
const run = (id: string, input: Row) => {
  expect(errors(id, input)).toEqual([]);
  return action(id).handle({ input, actor: 'admin', scopeId: null }) as { data: Row; version: string | null };
};
const version = (id: string, input: Row) => action(id).version?.({ input, actor: 'admin', scopeId: null });
const detail = (params: Row): ImportDetail => logKnowledgeMock.find(e => e.spec.id === importDetailEndpoint.id)!.handle({ equipment: [], context: {}, params, actor: 'admin' } as never);

const FIXTURE = [
  '메이커명\t공정명\t모델명',
  'Alpha Semicap\tEtch\tAlpha 100',
  'Alpha Semicap\tEtch, Planarization\tAlpha 200',
  'Delta Corp\tEtch, Dry Clean\tDelta 1',
  'Delta Corp\t\tDelta 2',
  'Beta Systems\tDeposition\tBeta 30 (retired)',
  'Gamma Tech (retired)\tEtch\tGamma 2',
  'Alpha Semicap\t\tAlpha',
  '\tEtch\tNo Maker',
].join('\n');

const pasted = (text = FIXTURE) => run('importPaste', { text }).data as { jobId: string; rowCount: number; status: string };
const validated = (text = FIXTURE) => {
  const { jobId } = pasted(text);
  run('importValidate', { jobId }, );
  return jobId;
};

beforeEach(() => { resetCatalog(); resetImports(); });

describe('importPaste', () => {
  it('stages a tab-separated sheet and touches no catalog row', () => {
    const before = all('model').length + all('vendor').length + all('process').length;
    expect(pasted()).toMatchObject({ rowCount: 8, status: 'mapped' });
    expect(all('model').length + all('vendor').length + all('process').length).toBe(before);
  });
  it('reads a comma sheet with aliases', () => expect(pasted('제조사,모델\nAlpha Semicap,Alpha 100')).toMatchObject({ rowCount: 1 }));
  it.each([
    ['missing 모델명', '메이커명\t공정명\nA\tB', ['text:missing_header', 'text.headers.모델명:missing_header']],
    ['both missing', '공정명\nA', ['text:missing_header', 'text.headers.메이커명:missing_header', 'text.headers.모델명:missing_header']],
    ['duplicate alias', '메이커명\t제조사\t모델명\nA\tB\tC', ['text:duplicate_header', 'text.headers.메이커명:duplicate_header', 'text.headers.제조사:duplicate_header']],
    ['empty', '  \n', ['text:empty']],
    ['ragged rows', '메이커명\t모델명\nA', ['text:unreadable']],
    ['too many rows', `메이커명,모델명\n${Array.from({ length: 1001 }, (_, i) => `A,M${i}`).join('\n')}`, ['text:too_many_rows']],
  ])('refuses %s without creating a job', (_name, text, expected) => expect(errors('importPaste', { text })).toEqual(expected));
});

describe('importValidate', () => {
  it('plans every fixture row: new, update, unchanged, conflicts and an error', () => {
    const jobId = validated();
    const { rows, job } = detail({ jobId, page: 0, pageSize: 50 });
    expect(rows.map(r => r.planState)).toEqual(['unchanged', 'update', 'new', 'new', 'conflict', 'conflict', 'conflict', 'error']);
    expect(rows[2]!.creates).toEqual({ vendor: 'Delta Corp', processes: ['Dry Clean'] });
    expect(rows[3]!.creates).toEqual({ vendor: 'Delta Corp', processes: [] });
    expect(rows[4]).toMatchObject({ targetId: expect.any(String), errors: [] });
    expect(rows[5]!.errors).toEqual([{ field: 'vendor_name', code: 'parent_inactive' }]);
    expect(rows[6]!.errors).toEqual([{ field: 'model_code', code: 'ambiguous_name' }]);
    expect(rows[7]!.errors).toEqual([{ field: 'vendor_name', code: 'required' }]);
    expect(job.status).toBe('review_required');
  });
  it('flags a model repeated in the file', () => {
    const { rows } = detail({ jobId: validated('메이커명,모델명\nNew Co,M1\nnew co,m1'), page: 0, pageSize: 50 });
    expect(rows[1]!.errors).toEqual([{ field: 'model_name', code: 'duplicate_in_file' }]);
  });
  it('starts at job version 1', () => {
    const { jobId } = pasted();
    const current = version('importValidate', { jobId });
    expect(current).toBe('1');
  });
  it('pages on the server and filters by plan state', () => {
    const jobId = validated();
    expect(detail({ jobId, page: 1, pageSize: 3 })).toMatchObject({ total: 8, rows: [{ rowNo: 4 }, { rowNo: 5 }, { rowNo: 6 }] });
    expect(detail({ jobId, page: 0, pageSize: 50, filters: [{ id: 'planState', op: 'in', value: ['conflict'] }] }).total).toBe(3);
  });
  it('answers an unknown job as the read error', () => expect(() => detail({ jobId: 'nope', page: 0, pageSize: 5 })).toThrow('not_found'));
});

describe('importResolve and importCancel', () => {
  it('skips conflict rows, bumps the version, and refuses map', () => {
    const jobId = validated();
    const before = Number(version('importResolve', { jobId }));
    expect(errors('importResolve', { jobId, resolutions: [{ rowNo: 5, resolution: 'map' }] })).toEqual(['resolutions.0.resolution:not_allowed']);
    const res = run('importResolve', { jobId, resolutions: [5, 6, 7].map(rowNo => ({ rowNo, resolution: 'skip' })) });
    expect(res.data).toMatchObject({ resolved: 3 });
    expect(Number(res.version)).toBe(before + 1);
    expect(detail({ jobId, page: 0, pageSize: 50 }).rows.filter(r => r.resolution === 'skip')).toHaveLength(3);
  });
  it('cancel leaves the catalog as it was', () => {
    const models = all('model').length;
    const jobId = validated();
    run('importCancel', { jobId });
    expect(detail({ jobId, page: 0, pageSize: 1 }).job.status).toBe('cancelled');
    expect(all('model')).toHaveLength(models);
    expect(all('vendor').some(v => v.name === 'Delta Corp')).toBe(false);
  });
});

describe('importApply', () => {
  it('works in several calls: progress until completed, parents first, one maker once', () => {
    const rows = ['메이커명,공정명,모델명', ...Array.from({ length: MOCK_APPLY_BATCH * 2 + 5 }, (_, i) => `Big Co,"P${i % 3}",Big ${i}`)].join('\n');
    const jobId = validated(rows);
    const planVersion = detail({ jobId, page: 0, pageSize: 1 }).job.planVersion;
    const seen: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const out = run('importApply', { jobId, expectedPlanVersion: planVersion }).data as { status: string; remaining: number };
      seen.push(`${out.status}:${out.remaining}`);
      if (out.status === 'completed') break;
    }
    expect(seen).toEqual(['applying:45', 'applying:5', 'completed:0']);
    expect(all('vendor').filter(v => v.name === 'Big Co')).toHaveLength(1);
    expect(all('model').filter(m => m.parentId === all('vendor').find(v => v.name === 'Big Co')!.id)).toHaveLength(MOCK_APPLY_BATCH * 2 + 5);
  });
  it('applies the fixture: skips conflicts, excludes the error, changes the catalog only after apply', () => {
    const jobId = validated();
    run('importResolve', { jobId, resolutions: [5, 6, 7].map(rowNo => ({ rowNo, resolution: 'skip' })) });
    const { planVersion } = detail({ jobId, page: 0, pageSize: 1 }).job;
    expect(all('vendor').some(v => v.name === 'Delta Corp')).toBe(false);
    expect(run('importApply', { jobId, expectedPlanVersion: planVersion }).data).toMatchObject({ outcome: 'progress', status: 'completed', remaining: 0 });
    const counts = detail({ jobId, page: 0, pageSize: 1 }).applyCounts;
    expect(counts).toMatchObject({ applied: 3, unchanged: 1, skipped: 3, excluded: 1, unresolved: 0, remaining: 0 });
    expect(all('vendor').filter(v => v.name === 'Delta Corp')).toHaveLength(1);
    expect(all('model').filter(m => m.name.startsWith('Delta'))).toHaveLength(2);
  });
  it('answers conflict for a stale plan version and for a cancelled job, not_found for an unknown one', () => {
    const jobId = validated();
    expect(run('importApply', { jobId, expectedPlanVersion: 99 }).data).toEqual({ outcome: 'conflict', reason: 'plan_version' });
    const { planVersion } = detail({ jobId, page: 0, pageSize: 1 }).job;
    run('importCancel', { jobId });
    expect(run('importApply', { jobId, expectedPlanVersion: planVersion }).data).toEqual({ outcome: 'conflict', reason: 'state' });
    expect(run('importApply', { jobId: 'nope', expectedPlanVersion: 1 }).data).toEqual({ outcome: 'not_found' });
  });
});
