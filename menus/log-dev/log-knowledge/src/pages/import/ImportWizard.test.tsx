// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider } from '@ap/ui';
import { groupId, menuPermission, spaceId, type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import { CATALOG_MANAGE_PERMISSION, type ImportRowView } from '../../endpoints';
import { manifests } from '../../index';
import CatalogManagement from '../CatalogManagement';
import { clearDraft, readDraft } from './importDraft';

const registry = createRegistry({
  permissions: [menuPermission('knowledge:catalog-manage')],
  spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '목적', en: 'Purpose' }, permission: CATALOG_MANAGE_PERMISSION, homeMenuId: 'log-knowledge-catalog' }],
  groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }],
  menus: manifests,
});
const session = testSession(['knowledge:catalog-manage', 'platform:view'], { user: { id: 'admin', name: 'admin', title: { ko: '관리자', en: 'Admin' } } });
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const answer = (over: Partial<ActionResponse<unknown>>): ActionResponse<never> =>
  ({ outcome: 'ok', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'fixture', ...over }) as ActionResponse<never>;

/** A one-job fake of the import server: row 1 is new (brings a maker and a process), row 2 conflicts, row 3 is an error. */
let conflicts: boolean;
let skipped: boolean;
let version: number;
let applied: number;
let calls: MenuAction[];
let refuse: Partial<ActionResponse<unknown>> | null;
let refuseCancel: boolean;
let applyAnswer: Partial<ActionResponse<unknown>> | null;
let holdApply: Promise<void> | null;
const row = (rowNo: number, over: Partial<ImportRowView>): ImportRowView => ({
  rowNo, raw: { 메이커명: `M${rowNo}`, 공정명: '', 모델명: `Model ${rowNo}` }, normalized: null, errors: [], planState: 'new', targetId: null, targetVersion: null, resolution: null, mapTargetId: null,
  applyStatus: null, applyError: null, resultTargetId: null, creates: null, ...over,
});
const rows = (): ImportRowView[] => [
  row(1, { creates: { vendor: 'Delta Corp', processes: ['Dry Clean'] }, applyStatus: applied > 0 ? 'applied' : null }),
  ...(conflicts ? [row(2, { planState: 'conflict', targetId: 'abc', resolution: skipped ? 'skip' : null, applyStatus: applied > 0 ? 'skipped' : null })] : []),
  row(3, { planState: 'error', errors: [{ field: 'vendor_name', code: 'required' }], applyStatus: applied > 0 ? 'excluded' : null }),
];
const counts = () => ({ applied: applied > 0 ? 1 : 0, unchanged: 0, skipped: applied > 0 && conflicts ? 1 : 0, excluded: applied > 0 ? 1 : 0, unresolved: 0, conflict: 0, failed: 0, remaining: applied === 1 ? 1 : 0 });
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => {
    if (req.endpoint === 'logKnowledge.importDetail') {
      const all = rows();
      return ok({
        job: { id: 'job-1', status: applied > 1 ? 'completed' : applied === 1 ? 'applying' : 'review_required', planVersion: 4, rowVersion: version, mapping: null, headers: [] },
        rows: all, total: all.length, applyCounts: counts(),
      });
    }
    return ok({ rows: [], total: 0 });
  },
  menuAction: async (req: MenuAction) => {
    calls.push(req);
    if (refuse) return answer(refuse);
    if (refuseCancel && req.action === 'logKnowledge.importCancel') return answer({ outcome: 'forbidden' });
    if (applyAnswer && req.action === 'logKnowledge.importApply') return answer(applyAnswer);
    if (holdApply && req.action === 'logKnowledge.importApply') await holdApply;
    switch (req.action) {
      case 'logKnowledge.importPaste': return answer({ data: { jobId: 'job-1', rowCount: 3, status: 'mapped' } });
      case 'logKnowledge.importValidate': version += 1; return answer({ data: { jobId: 'job-1', status: 'review_required', planVersion: 4 }, version: String(version) });
      case 'logKnowledge.importResolve': skipped = true; version += 1; return answer({ data: { jobId: 'job-1', status: 'review_required', planVersion: 5, resolved: 1 }, version: String(version) });
      case 'logKnowledge.importCancel': return answer({ data: { jobId: 'job-1', status: 'cancelled', planVersion: 4 }, version: String(version + 1) });
      case 'logKnowledge.importApply': {
        applied += 1;
        return answer({ data: { outcome: 'progress', jobId: 'job-1', status: applied > 1 ? 'completed' : 'applying', planVersion: 4, remaining: applied > 1 ? 0 : 1, counts: counts() } });
      }
      default: return answer({});
    }
  },
  session: () => session,
});

const slow = { timeout: 8000 };
vi.setConfig({ testTimeout: 30000 });
let restoreGeometry: () => void;
beforeEach(() => { conflicts = true; skipped = false; version = 1; applied = 0; calls = []; refuse = null; refuseCancel = false; applyAnswer = null; holdApply = null; clearDraft(); restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); });

function open(tab = 'model') {
  window.history.replaceState(null, '', `/log/knowledge/catalog?v=1&tab=${tab}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><CatalogManagement /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
const paste = async (text = '메이커명\t모델명\nA\tB') => {
  fireEvent.click(await screen.findByRole('button', { name: '가져오기' }, slow));
  fireEvent.change(await screen.findByLabelText('붙여넣을 목록'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '검사' }));
};
const draftSaved = () => readDraft('admin') !== null;
const stepName = () => document.querySelector('[aria-current="step"]')?.textContent ?? '';
const next = () => fireEvent.click(screen.getByRole('button', { name: '다음 단계' }));
const toApplyStep = async () => {
  await paste();
  await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
  next();
  await screen.findByText('확인이 필요한 행 1개', {}, slow);
  fireEvent.click(screen.getByRole('button', { name: '모두 건너뛰기' }));
  await waitFor(() => expect((screen.getByRole('button', { name: '다음 단계' }) as HTMLButtonElement).disabled).toBe(false), slow);
  next();
  return screen.findByRole('button', { name: '적용' }, slow);
};
const actions = () => calls.map(c => c.action.replace('logKnowledge.', ''));

describe('catalog import wizard', () => {
  it('has no 가져오기 button on the SW 버전 tab', async () => {
    open('software');
    await screen.findByRole('button', { name: 'SW 버전 추가' }, slow);
    expect(screen.queryByRole('button', { name: '가져오기' })).toBeNull();
  });

  it('paste → check → skip → apply in two calls → result; versions and plan versions travel on the calls', async () => {
    open();
    await paste();
    await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
    expect(stepName()).toContain('검사 결과');
    expect(document.activeElement?.textContent).toBe('2. 검사 결과');
    const counts = document.querySelector('dl')!;
    expect(counts.textContent).toMatch(/새로 추가1/);
    expect(counts.textContent).toMatch(/확인 필요1/);
    expect(counts.textContent).toMatch(/오류1/);
    expect(screen.getByText(/새로 만들 메이커/).textContent).toMatch(/메이커 1 · 공정 1/);
    expect(calls.find(c => c.action.endsWith('importValidate'))?.expectedVersion).toBe('1');
    next();
    await screen.findByText('확인이 필요한 행 1개', {}, slow);
    expect(screen.getByText(/같은 모델이 카탈로그에 있지만 비활성입니다/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '다음 단계' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '모두 건너뛰기' }));
    await waitFor(() => expect((screen.getByRole('button', { name: '다음 단계' }) as HTMLButtonElement).disabled).toBe(false), slow);
    expect(calls.find(c => c.action.endsWith('importResolve'))?.expectedVersion).toBe('2');
    next();
    fireEvent.click(await screen.findByRole('button', { name: '적용' }, slow));
    await screen.findByText('적용했습니다', {}, slow);
    const applyCalls = calls.filter(c => c.action.endsWith('importApply'));
    expect(applyCalls).toHaveLength(2);
    expect(applyCalls.map(c => c.input)).toEqual([{ jobId: 'job-1', expectedPlanVersion: 4 }, { jobId: 'job-1', expectedPlanVersion: 4 }]);
    expect(new Set(applyCalls.map(c => c.idempotencyKey)).size).toBe(2);
    expect(stepName()).toContain('적용 결과');
    fireEvent.click(screen.getByRole('button', { name: '카탈로그로 돌아가기' }));
    await screen.findByRole('button', { name: '모델 추가' }, slow);
  });

  it('skips step 3 when nothing needs a decision', async () => {
    conflicts = false;
    open();
    await paste();
    await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
    next();
    expect(await screen.findByRole('button', { name: '적용' }, slow)).toBeTruthy();
    expect(stepName()).toContain('적용 결과');
    expect(actions()).not.toContain('importResolve');
  });

  it('shows the refusal sentence and keeps the check button usable', async () => {
    refuse = { outcome: 'invalid', fieldErrors: [{ path: ['text'], code: 'missing_header' }, { path: ['text', 'headers', '모델명'], code: 'missing_header' }] };
    open();
    await paste('메이커명\nA');
    expect(await screen.findByText(/‘모델명’ 머리글이 없습니다/, {}, slow)).toBeTruthy();
    expect(stepName()).toContain('목록 붙여넣기');
    expect(screen.queryByText(/missing_header/)).toBeNull();
    expect((screen.getByRole('button', { name: '검사' }) as HTMLButtonElement).disabled).toBe(false);
    expect(actions()).toEqual(['importPaste']);
  });

  it('asks before leaving and cancels the staged job with its current version', async () => {
    open();
    await paste();
    await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    await screen.findByText('가져오기를 그만둘까요?', {}, slow);
    fireEvent.click(screen.getByText('그만두기'));
    await screen.findByRole('button', { name: '모델 추가' }, slow);
    expect(calls.filter(c => c.action.endsWith('importCancel'))).toHaveLength(1);
    expect(calls.find(c => c.action.endsWith('importCancel'))?.expectedVersion).toBe(String(version));
    expect(actions()).not.toContain('importApply');
  });

  it('leaving a blank step 1 asks nothing and cancels nothing', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: '가져오기' }, slow));
    fireEvent.click(await screen.findByRole('button', { name: '목록으로' }, slow));
    await screen.findByRole('button', { name: '모델 추가' }, slow);
    expect(calls).toEqual([]);
  });

  it('keeps keyboard focus after 건너뛰기: it moves to the step\'s next control, never to body', async () => {
    open();
    await paste();
    await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
    next();
    await screen.findByText('확인이 필요한 행 1개', {}, slow);
    const skip = screen.getByRole('button', { name: '2행 건너뛰기' });
    skip.focus();
    fireEvent.click(skip);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '다음 단계' })), slow);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('계속하기 closes the leave dialog and stays on the step', async () => {
    open();
    await paste();
    await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    await screen.findByText('가져오기를 그만둘까요?', {}, slow);
    fireEvent.click(screen.getByRole('button', { name: '계속하기' }));
    await waitFor(() => expect(screen.queryByText('가져오기를 그만둘까요?')).toBeNull(), slow);
    expect(stepName()).toContain('검사 결과');
    expect(actions()).not.toContain('importCancel');
  });

  it('re-pasting keeps the old job and sends no new paste when cancelling it is refused', async () => {
    open();
    await paste();
    await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
    refuseCancel = true;
    fireEvent.click(screen.getByRole('button', { name: '다시 붙여넣기' }));
    fireEvent.click(await screen.findByRole('button', { name: '검사' }, slow));
    await screen.findByText(/취소하지 못해 새로 검사하지 않았습니다/, {}, slow);
    expect(actions().filter(a => a === 'importPaste')).toHaveLength(1);
  });

  it('a conflict answer stops the apply but keeps the job: leaving still asks and cancels', async () => {
    open();
    fireEvent.click(await toApplyStep());
    applyAnswer = { data: { outcome: 'conflict', reason: 'state' } };
    await screen.findByText('적용을 끝내지 못했습니다', {}, slow);
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    await screen.findByText('가져오기를 그만둘까요?', {}, slow);
    fireEvent.click(screen.getByText('그만두기'));
    await screen.findByRole('button', { name: '모델 추가' }, slow);
    expect(actions()).toContain('importCancel');
  });

  it('exhausted transport retries leave a 다시 적용 button and the exit confirmation', async () => {
    open();
    const apply = await toApplyStep();
    applyAnswer = { outcome: 'error' };
    fireEvent.click(apply);
    await screen.findByText('적용을 끝내지 못했습니다', {}, slow);
    expect(screen.getByRole('button', { name: '다시 적용' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '카탈로그로 돌아가기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    await screen.findByText('가져오기를 그만둘까요?', {}, slow);
  });

  it('unmounting during an in-flight apply step rejects nothing', async () => {
    open();
    const apply = await toApplyStep();
    let release!: () => void;
    holdApply = new Promise<void>(resolve => { release = resolve; });
    fireEvent.click(apply);
    await waitFor(() => expect(actions()).toContain('importApply'), slow);
    cleanup();
    release();
    await new Promise(resolve => { setTimeout(resolve, 50); });
  });

  describe('draft kept across leaving through the menu', () => {
    it('restores the pasted text and offers 이어서 하기 for a staged job', async () => {
      open();
      await paste('메이커명\t모델명\nA\tB');
      await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
      cleanup();
      open();
      fireEvent.click(await screen.findByRole('button', { name: '가져오기' }, slow));
      expect(((await screen.findByLabelText('붙여넣을 목록')) as HTMLTextAreaElement).value).toBe('메이커명\t모델명\nA\tB');
      expect((screen.getByRole('button', { name: '검사' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: '이어서 하기' }));
      await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
      expect(stepName()).toContain('검사 결과');
    });

    it('새로 시작 cancels the saved job and clears the text', async () => {
      open();
      await paste();
      await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
      cleanup();
      calls = [];
      open();
      fireEvent.click(await screen.findByRole('button', { name: '가져오기' }, slow));
      fireEvent.click(await screen.findByRole('button', { name: '새로 시작' }, slow));
      await waitFor(() => expect(((screen.getByLabelText('붙여넣을 목록')) as HTMLTextAreaElement).value).toBe(''), slow);
      expect(actions()).toContain('importCancel');
      expect(draftSaved()).toBe(false);
    });

    it('is cleared by 그만두기 and by a finished apply', async () => {
      open();
      await paste();
      await screen.findByText('아직 아무것도 저장되지 않았습니다', {}, slow);
      expect(draftSaved()).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
      await screen.findByText('가져오기를 그만둘까요?', {}, slow);
      fireEvent.click(screen.getByText('그만두기'));
      await screen.findByRole('button', { name: '모델 추가' }, slow);
      expect(draftSaved()).toBe(false);
      fireEvent.click(await toApplyStep());
      await screen.findByText('적용했습니다', {}, slow);
      expect(draftSaved()).toBe(false);
    });

    it('asks the browser before unloading while a draft exists, and not when blank', async () => {
      open();
      fireEvent.click(await screen.findByRole('button', { name: '가져오기' }, slow));
      const blank = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(blank);
      expect(blank.defaultPrevented).toBe(false);
      fireEvent.change(await screen.findByLabelText('붙여넣을 목록'), { target: { value: '메이커명\t모델명\nA\tB' } });
      const draft = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(draft);
      expect(draft.defaultPrevented).toBe(true);
    });
  });
});
