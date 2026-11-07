import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Info, X } from 'lucide-react';
import type { ActionResult, ActionSpec, ApiResponse } from '@ap/contracts';
import { useMenuAction, useMenuFetch, usePlatform } from '@ap/kernel';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Callout, FieldLabel, ProgressMeter, StatusBadge, Textarea, cn, copyText,
} from '@ap/ui';
import {
  importApply, importCancel, importDetailEndpoint, importPaste, importResolve, importValidate,
  type ImportApplyCounts, type ImportApplyResult, type ImportCancelInput, type ImportDetail, type ImportDetailParams, type ImportPasteInput, type ImportPasteResult, type ImportResolveInput,
  type ImportRowView, type ImportStepResult, type ImportValidateInput,
} from '../../endpoints';
import { ImportRowsTable } from './ImportTables';
import { clearDraft, readDraft, writeDraft } from './importDraft';
import {
  EXAMPLE, JOB_STATUS_LABEL, PASTE_ROW_LIMIT, STEP_LABEL, TEMPLATE_HEADER, actionFailureText, applyEndText, cellOf, conflictText, countNewParents, fetchAllRows, nextStep, pasteRefusalText,
  previousStep, resolveInBatches, runApplyLoop, stepSkipped, type AllRows, type ApplyEnd, type ApplyProgress, type StepId,
} from './importModel';

type Spec<I, T> = ActionSpec<I, T>;
type Plan = Extract<AllRows, { ok: true }>;
const STEPS: readonly StepId[] = [1, 2, 3, 4];
const LEAVE_BLOCKED: readonly string[] = ['applying', 'completed', 'partial_failure', 'cancelled'];
/** Job statuses where nothing has been applied yet: a saved job in one of these can be picked up again. */
const BEFORE_APPLY: readonly string[] = ['mapped', 'validated', 'review_required'];
/** Job statuses that end the wizard: nothing more can be done to the job from here. */
const TERMINAL: readonly string[] = ['completed', 'partial_failure', 'failed', 'cancelled'];

function Notice({ tone, title, children, action }: { tone: 'amber' | 'red' | 'blue' | 'emerald'; title: string; children: ReactNode; action?: ReactNode }) {
  return <Callout tone={tone} icon={tone === 'blue' ? <Info className="size-4" aria-hidden /> : undefined} title={title} action={action}>{children}</Callout>;
}

function StepBar({ step, conflicts }: { step: StepId; conflicts: number }) {
  return <ol aria-label="가져오기 단계" className="grid grid-cols-4 gap-2">
    {STEPS.map(id => {
      const skipped = stepSkipped(id, conflicts), current = id === step, past = id < step && !skipped;
      return <li key={id} aria-current={current ? 'step' : undefined}
        className={cn('flex items-center gap-2 border-t-2 px-1 pt-2 text-sm', current ? 'border-accent-primary font-semibold text-text-primary' : past ? 'border-accent-success text-text-secondary' : 'border-border-subtle text-text-muted')}>
        <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-pill text-xs', past ? 'bg-accent-success-soft text-text-success-label' : current ? 'bg-accent-primary-soft text-text-primary' : 'bg-surface-sunken')}>
          {past ? <Check className="size-3" /> : id}
        </span>
        <span>{STEP_LABEL[id]}{skipped && step > 2 ? <span className="t-caption ml-1.5 text-text-muted">(해당 없음)</span> : null}</span>
      </li>;
    })}
  </ol>;
}

function Counts({ items }: { items: readonly (readonly [string, number, 'success' | 'warning' | 'danger' | 'neutral' | 'info'])[] }) {
  return <dl className="flex flex-wrap gap-2">
    {items.map(([label, n, tone]) => <div key={label} className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card px-3 py-1.5">
      <dt className="text-sm text-text-secondary">{label}</dt><dd><StatusBadge tone={tone}><span className="tabular">{n}</span></StatusBadge></dd>
    </div>)}
  </dl>;
}

const countRows = (rows: readonly ImportRowView[]) => {
  const by = { new: 0, update: 0, unchanged: 0, conflict: 0, error: 0 };
  for (const r of rows) if (r.planState in by) by[r.planState as keyof typeof by] += 1;
  return by;
};

/**
 * 모델 가져오기 (#1195 c, owner-confirmed variant A): the wizard replaces the catalog list. 목록 붙여넣기 → 검사 결과 → 확인 필요 행 정리 (only with
 * conflicts) → 적용 결과. Nothing is saved before 「적용」; leaving earlier cancels the staged job. Reads and writes go through the declared
 * import actions and `importDetail` only.
 */
export function ImportWizard({ onExit }: { onExit: (changed: boolean) => void }) {
  // Keyed by user: a session change remounts the wizard, so no text, plan or job of one user is shown or saved under another.
  const { user } = usePlatform();
  return <ImportWizardFor key={user.id} userId={user.id} onExit={onExit} />;
}

function ImportWizardFor({ userId, onExit }: { userId: string; onExit: (changed: boolean) => void }) {
  const { toast } = usePlatform();
  const paste = useMenuAction(importPaste as Spec<ImportPasteInput, ImportPasteResult>);
  const validate = useMenuAction(importValidate as Spec<ImportValidateInput, ImportStepResult>);
  const resolve = useMenuAction(importResolve as Spec<ImportResolveInput, ImportStepResult & { resolved: number }>);
  const cancel = useMenuAction(importCancel as Spec<ImportCancelInput, ImportStepResult>);
  const apply = useMenuAction(importApply as Spec<{ jobId: string; expectedPlanVersion: number }, ImportApplyResult>);
  const detailFetch = useMenuFetch(importDetailEndpoint);
  const fetchRef = useRef(detailFetch.fetch);
  useEffect(() => { fetchRef.current = detailFetch.fetch; });
  const fetchDetail = useCallback((params: ImportDetailParams, signal?: AbortSignal): Promise<ApiResponse<ImportDetail>> => fetchRef.current(params, signal), []);

  const [saved] = useState(() => readDraft(userId));
  const [step, setStep] = useState<StepId>(1);
  const [text, setText] = useState(saved?.text ?? '');
  const [sourceName, setSourceName] = useState<string | null>(saved?.sourceName ?? null);
  /** A staged job saved by an earlier visit and not loaded yet; `failed` once cancelling it was refused. */
  const [resume, setResume] = useState<{ jobId: string; failed?: boolean } | null>(saved?.jobId ? { jobId: saved.jobId } : null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<{ text: string; busy?: boolean } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<{ error?: string } | null>(null);
  const [phase, setPhase] = useState<'ready' | 'running' | 'stopped' | 'finished'>('ready');
  const [progress, setProgress] = useState<ApplyProgress | null>(null);
  const [end, setEnd] = useState<ApplyEnd | null>(null);
  const [result, setResult] = useState<ImportDetail | null>(null);
  const [revision, setRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uid = useId();
  const running = useRef(false);
  const mounted = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Row number after which keyboard focus continues once a skip has settled (Infinity: no row). */
  const refocus = useRef<number | null>(null);

  const job = plan?.detail.job ?? null;
  const rows = useMemo(() => plan?.rows ?? [], [plan]);
  const conflicts = useMemo(() => rows.filter(r => r.planState === 'conflict'), [rows]);
  const counts = countRows(rows);
  const parents = useMemo(() => countNewParents(rows), [rows]);
  const busy = working !== null || paste.pending || validate.pending || resolve.pending || cancel.pending;

  // Focus moves to the step heading on every step change (and on the first render).
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const activeJobId = job?.id ?? resume?.jobId ?? null;
  const finished = phase === 'finished';
  const hasDraft = text.trim() !== '' || activeJobId !== null;
  // The draft (text, file name, staged job) survives leaving through the menu; it ends with the apply or an explicit 그만두기.
  useEffect(() => {
    if (finished || !hasDraft) { clearDraft(userId); return; }
    writeDraft(userId, { text, sourceName, jobId: activeJobId });
  }, [finished, hasDraft, text, sourceName, activeJobId, userId]);
  useEffect(() => {
    if (finished || !hasDraft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [finished, hasDraft]);
  // After a skip settles, keyboard focus goes to the next unresolved row's button, else the step's next control (never to body).
  useEffect(() => {
    if (refocus.current === null || working !== null) return;
    const after = refocus.current;
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('button[data-skip-row]') ?? [])];
    const target = buttons.find(b => Number(b.dataset['skipRow']) > after) ?? buttons[0] ?? rootRef.current?.querySelector<HTMLButtonElement>('button[data-next-step]');
    refocus.current = null;
    target?.focus();
  });

  const read = useCallback(async (jobId: string): Promise<Plan | null> => {
    const all = await fetchAllRows(page => fetchDetail({ jobId, ...page, sorting: [{ id: 'rowNo', desc: false }] }));
    if (!all.ok) { setError({ text: '가져오기 작업을 읽지 못했습니다. 잠시 후 다시 시도하세요.' }); return null; }
    setPlan(all);
    return all;
  }, [fetchDetail]);

  /** Re-checks the staged job (same rows, current catalog) and shows the result. */
  const check = useCallback(async (current: Plan) => {
    const res = await validate.run({ jobId: current.detail.job.id }, { expectedVersion: String(current.detail.job.rowVersion) });
    if (res.outcome !== 'ok') {
      await read(current.detail.job.id);
      setError({ text: res.outcome === 'conflict' ? '다른 곳에서 먼저 이 작업이 바뀌었습니다. 다시 눌러 주세요.' : actionFailureText(res.outcome) });
      return false;
    }
    const next = await read(current.detail.job.id);
    if (!next) return false;
    setError(null); setStep(2); setRevision(n => n + 1);
    return true;
  }, [read, validate]);

  const submit = async () => {
    setError(null); setWorking('검사하는 중…');
    try {
      if (job) {
        if (!(await cancelJob())) { setError({ text: '이전 검사 작업을 취소하지 못해 새로 검사하지 않았습니다. 잠시 후 다시 시도하세요.' }); return; }
        setPlan(null);
      }
      const res = await paste.run({ text, ...(sourceName ? { sourceName } : {}) });
      if (res.outcome === 'invalid') { setError(pasteRefusalText(res.fieldErrors)); return; }
      if (res.outcome !== 'ok' || !res.data) { setError({ text: actionFailureText(res.outcome) }); return; }
      // The job exists on the server from here on: keep its id at once, so a failed read leaves 이어서 하기 (retry) and 새로 시작 (cancel).
      // Saved to the draft synchronously too: the passive effect would run only after a render, and an unmount mid-read must not lose the id.
      writeDraft(userId, { text, sourceName, jobId: res.data.jobId });
      setResume({ jobId: res.data.jobId });
      const staged = await read(res.data.jobId);
      if (staged) { setResume(null); await check(staged); }
    } catch {
      // The SDK rejects with AbortError when the screen goes away or the session changes mid-check; the saved draft keeps the job id.
      if (mounted.current) setError({ text: '검사를 끝내지 못했습니다. 이어서 하기로 다시 시도하세요.' });
    } finally { setWorking(null); }
  };

  const recheck = async () => {
    if (!plan) return;
    setError(null); setWorking('다시 검사하는 중…');
    try { await check(plan); } finally { setWorking(null); }
  };

  const skipRows = async (rowNos: number[], focusAfter = Number.POSITIVE_INFINITY) => {
    if (!plan || rowNos.length === 0) return;
    setError(null); setWorking('정리하는 중…'); refocus.current = focusAfter;
    try {
      const out = await resolveInBatches(resolve.run, plan.detail.job.id, rowNos, String(plan.detail.job.rowVersion));
      await read(plan.detail.job.id);
      if (!out.ok) setError({ text: out.outcome === 'conflict' ? '다른 곳에서 먼저 이 작업이 바뀌었습니다. 다시 눌러 주세요.' : '건너뛰기를 저장하지 못했습니다. 다시 시도하세요.' });
    } finally { setWorking(null); }
  };

  const runApply = async () => {
    if (!plan || running.current) return;
    running.current = true;
    const before = { phase, end };
    setError(null); setEnd(null); setPhase('running'); setProgress(null);
    try {
      const fresh = await read(plan.detail.job.id);
      if (!mounted.current) return;
      if (!fresh) {
        // A resumed applying job may have rows applied already: keep its stopped recovery (다시 적용), never fall back to "nothing saved".
        if (before.phase === 'stopped') { setEnd(before.end); setPhase('stopped'); } else setPhase('ready');
        return;
      }
      const outcome = await runApplyLoop({
        step: expectedPlanVersion => apply.run({ jobId: plan.detail.job.id, expectedPlanVersion }) as Promise<ActionResult<ImportApplyResult>>,
        planVersion: fresh.detail.job.planVersion, onProgress: next => { if (mounted.current) setProgress(next); }, shouldStop: () => !mounted.current,
      });
      if (!mounted.current) return;
      const after = await fetchDetail({ jobId: plan.detail.job.id, page: 0, pageSize: 1 });
      if (!mounted.current) return;
      if (after.outcome === 'ok' && after.data) setResult(after.data); else if (outcome.kind === 'done') setResult(null);
      // Only a job that cannot change any more ends the wizard; a loop that merely stopped keeps its recovery and its cancellation.
      const status = after.outcome === 'ok' && after.data ? after.data.job.status : null;
      const terminal = outcome.kind === 'done' || outcome.kind === 'not_found' || (status !== null && TERMINAL.includes(status));
      setEnd(outcome); setPhase(terminal ? 'finished' : 'stopped'); setRevision(n => n + 1);
    } catch {
      // The SDK rejects with AbortError when the screen goes away or the session changes; only a still-mounted wizard needs an end state.
      if (mounted.current) { setEnd({ kind: 'failed' }); setPhase('stopped'); }
    } finally { running.current = false; }
  };

  /** Cancels the staged job with the version read just now; false when the server refused. */
  async function cancelJob(): Promise<boolean> {
    return activeJobId === null ? true : cancelJobById(activeJobId);
  }
  async function cancelJobById(jobId: string): Promise<boolean> {
    const latest = await fetchDetail({ jobId, page: 0, pageSize: 1 });
    if (latest.outcome !== 'ok' || !latest.data) return false;
    if (LEAVE_BLOCKED.includes(latest.data.job.status)) return true;
    const res = await cancel.run({ jobId }, { expectedVersion: String(latest.data.job.rowVersion) });
    return res.outcome === 'ok';
  }

  /** 이어서 하기: reloads the saved job; only one that has not started applying can be picked up. */
  const resumeJob = async () => {
    if (!resume) return;
    setError(null); setWorking('불러오는 중…');
    try {
      const loaded = await read(resume.jobId);
      if (!loaded) return;
      const status = loaded.detail.job.status;
      if (status === 'applying') {
        // Rows may be applied already and the server accepts further apply calls: keep the job and offer 다시 적용 (or an informed exit).
        setResume(null); setEnd({ kind: 'failed' }); setPhase('stopped'); setStep(4); setRevision(n => n + 1);
        return;
      }
      if (!BEFORE_APPLY.includes(status)) { setResume(null); setPlan(null); setText(''); setSourceName(null); setError({ text: '이전 가져오기 작업은 이미 적용을 시작했거나 끝나서 이어서 할 수 없습니다. 카탈로그에서 결과를 확인하세요.' }); return; }
      setResume(null);
      if (status === 'mapped') await check(loaded); else { setStep(2); setRevision(n => n + 1); }
    } finally { setWorking(null); }
  };
  /** 새로 시작: cancels the saved job, then drops the saved text. `force` starts over even though the job could not be cancelled. */
  const startFresh = async (force = false) => {
    if (!resume) return;
    setError(null); setWorking('취소하는 중…');
    try {
      if (!force && !(await cancelJobById(resume.jobId))) {
        setResume({ jobId: resume.jobId, failed: true });
        setError({ text: '이전 가져오기 작업을 취소하지 못했습니다. 다시 시도하거나, 그대로 새로 시작할 수 있습니다.' });
        return;
      }
      setResume(null); setText(''); setSourceName(null);
    } finally { setWorking(null); }
  };

  const requestExit = () => {
    if (phase === 'finished') { onExit(true); return; }
    if (!hasDraft) { onExit(false); return; }
    setLeaving({});
  };
  const confirmExit = async (force = false) => {
    if (!force && !(await cancelJob())) { setLeaving({ error: '가져오기 작업을 취소하지 못했습니다. 그래도 나가면 검사한 내용은 저장되지 않은 채 남습니다.' }); return; }
    clearDraft(userId);
    onExit(false);
  };

  const ended = finished || phase === 'stopped';
  const unresolved = conflicts.filter(r => r.resolution !== 'skip');
  const headingText = `${step}. ${STEP_LABEL[step]}`;

  let body: ReactNode;
  if (step === 1) {
    const dataRows = Math.max(0, text.split(/\r\n|\n|\r/).filter(l => l.trim() !== '').length - 1);
    body = <div className="grid gap-4">
      {resume && <Notice tone="blue" title="이어서 할 수 있는 가져오기 작업이 있습니다"
        action={<div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => { void resumeJob(); }}>이어서 하기</Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => { void startFresh(); }}>새로 시작</Button>
          {resume.failed && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => { void startFresh(true); }}>그래도 새로 시작</Button>}
        </div>}>
        이전에 검사한 작업이 남아 있습니다. 아직 적용하지 않았으므로 카탈로그는 바뀌지 않았습니다. 「새로 시작」은 그 작업을 취소하고 붙여넣은 내용을 지웁니다.</Notice>}
      <div className="grid gap-1.5">
        <FieldLabel htmlFor={`${uid}-paste`}>붙여넣을 목록</FieldLabel>
        <p id={`${uid}-help`} className="text-sm text-text-secondary">엑셀에서 설비사명 · 모델명 · 공정명 열을 머리글 행과 함께 복사해 붙여넣으세요. 공정이 여러 개면 쉼표로 구분합니다.</p>
        <div className="t-mono"><Textarea id={`${uid}-paste`} aria-describedby={`${uid}-help ${uid}-limit`} rows={12} value={text} spellCheck={false}
          onChange={e => setText(e.target.value)} placeholder={`${EXAMPLE.header.join('\t')}\n${EXAMPLE.rows[0]!.join('\t')}`} /></div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id={`${uid}-limit`} className="t-caption text-text-muted">한 번에 {PASTE_ROW_LIMIT.toLocaleString('ko-KR')}행까지{dataRows > 0 && <span className="tabular"> · 지금 {dataRows.toLocaleString('ko-KR')}행</span>}{sourceName && <span> · 파일 {sourceName}</span>}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => { void copyText(TEMPLATE_HEADER).then(ok => toast(ok ? '머리글 행을 복사했습니다' : '복사하지 못했습니다. 직접 입력해 주세요.', ok ? 'info' : 'warning')); }}>양식 복사</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>CSV 파일 열기</Button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" aria-label="CSV 파일 선택" tabIndex={-1} className="sr-only" onChange={e => {
              const file = e.target.files?.[0]; e.target.value = '';
              if (file) void file.text().then(content => { setText(content); setSourceName(file.name); setError(null); }).catch(() => setError({ text: '파일을 읽지 못했습니다.' }));
            }} />
          </div>
        </div>
      </div>
      <figure className="grid gap-1.5">
        <figcaption className="t-caption text-text-muted">예시</figcaption>
        <table className="w-full max-w-xl border-collapse text-sm">
          <thead><tr>{EXAMPLE.header.map(h => <th key={h} scope="col" className="border border-border-subtle bg-surface-sunken px-2 py-1 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>{EXAMPLE.rows.map(r => <tr key={r.join()}>{r.map((c, i) => <td key={i} className="border border-border-subtle px-2 py-1">{c}</td>)}</tr>)}</tbody>
        </table>
      </figure>
    </div>;
  } else if (step === 2 && job && plan) {
    body = <div className="grid gap-3">
      <Notice tone="blue" title="아직 아무것도 저장되지 않았습니다">검사만 한 상태입니다. 카탈로그는 마지막 단계에서 「적용」을 누른 뒤에만 바뀝니다. 오류 행은 적용에서 빠집니다.</Notice>
      <Counts items={[['새로 추가', counts.new, 'success'], ['변경', counts.update, 'info'], ['그대로', counts.unchanged, 'neutral'], ['확인 필요', counts.conflict, 'warning'], ['오류', counts.error, 'danger']]} />
      {(parents.vendors > 0 || parents.processes > 0) && <p className="text-sm text-text-secondary">새로 만들 설비사 <span className="tabular font-semibold">{parents.vendors}</span> · 공정 <span className="tabular font-semibold">{parents.processes}</span></p>}
      <ImportRowsTable key={`plan:${revision}`} mode="plan" title="검사 결과 행" jobId={job.id} mapping={job.mapping} fetchDetail={fetchDetail} onDetail={() => undefined} />
    </div>;
  } else if (step === 3 && job) {
    body = <div className="grid gap-3">
      <Notice tone="amber" title={`확인이 필요한 행 ${conflicts.length}개`}>이 행들은 건너뛰기만 할 수 있습니다. 카탈로그를 고쳐서 반영하려면 고친 뒤 「다시 검사」를 누르세요.</Notice>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || unresolved.length === 0} onClick={() => { void skipRows(unresolved.map(r => r.rowNo)); }}>모두 건너뛰기</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => { void recheck(); }}>다시 검사</Button>
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-md border border-border-subtle">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">확인 필요 행</caption>
          <thead className="sticky top-0 bg-surface-sunken"><tr>{['행', '파일 값', '카탈로그 쪽 상황', '처리'].map(h => <th key={h} scope="col" className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>{conflicts.map(r => {
            const guide = conflictText(r);
            return <tr key={r.rowNo} className="border-t border-border-subtle align-top">
              <td className="tabular px-3 py-2">{r.rowNo}</td>
              <td className="px-3 py-2"><dl className="grid grid-cols-[auto_1fr] gap-x-2">
                {([['설비사명', 'vendor'], ['공정명', 'process'], ['모델명', 'model']] as const).map(([label, kind]) => <div key={kind} className="contents"><dt className="text-text-muted">{label}</dt><dd>{cellOf(r, kind, job.mapping) || '—'}</dd></div>)}
              </dl></td>
              <td className="max-w-md px-3 py-2"><p>{guide.why}</p><p className="mt-1 text-text-secondary">{guide.fix}</p></td>
              <td className="px-3 py-2">{r.resolution === 'skip' ? <StatusBadge tone="neutral">건너뜀</StatusBadge>
                : <Button type="button" size="sm" variant="secondary" disabled={busy} aria-label={`${r.rowNo}행 건너뛰기`} data-skip-row={r.rowNo} onClick={() => { void skipRows([r.rowNo], r.rowNo); }}>건너뛰기</Button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {unresolved.length > 0 && <p className="text-sm text-text-muted">건너뛰기를 누르지 않은 행이 {unresolved.length}개 있습니다. 모두 처리해야 다음으로 갈 수 있습니다.</p>}
    </div>;
  } else if (step === 4 && job && plan) {
    const doneEnd = end?.kind === 'done' ? end : null;
    const live: ImportApplyCounts | null = result?.applyCounts ?? doneEnd?.counts ?? progress?.counts ?? null;
    const total = rows.length;
    const doneRows = progress ? total - progress.remaining : 0;
    const status = result?.job.status ?? doneEnd?.status ?? job.status;
    const writes = counts.new + counts.update;
    body = <div className="grid gap-3">
      {phase === 'ready' && <>
        <Notice tone="blue" title="아직 아무것도 저장되지 않았습니다">「적용」을 누르면 카탈로그가 바뀝니다.</Notice>
        <p className="text-sm">새로 추가 <span className="tabular font-semibold">{counts.new}</span>행 · 변경 <span className="tabular font-semibold">{counts.update}</span>행을 반영합니다.
          {parents.vendors + parents.processes > 0 && <> 새 설비사 {parents.vendors} · 공정 {parents.processes}도 함께 만듭니다.</>}
          {' '}건너뜀 {conflicts.length} · 오류 제외 {counts.error} · 그대로 {counts.unchanged}행은 반영하지 않습니다.</p>
        {writes === 0 && <p className="text-sm text-text-muted">반영할 행이 없습니다. 적용해도 카탈로그는 바뀌지 않습니다.</p>}
      </>}
      {phase === 'running' && <div className="grid gap-2" role="status" aria-live="polite">
        <p className="text-sm font-semibold">적용하는 중… 이 화면을 닫지 마세요.</p>
        <ProgressMeter value={doneRows} max={Math.max(total, 1)} semantics={{ role: 'progressbar', label: '적용 진행' }} />
        <p className="t-caption text-text-muted tabular">{progress ? `${doneRows}행 처리 · ${progress.remaining}행 남음` : '시작하는 중…'}</p>
      </div>}
      {ended && end && end.kind !== 'done' && end.kind !== 'aborted' && <Notice tone={end.kind === 'conflict' ? 'amber' : 'red'} title="적용을 끝내지 못했습니다"
        action={end.kind === 'conflict' ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => { setPhase('ready'); void recheck(); }}>다시 검사</Button> : undefined}>{applyEndText(end)}</Notice>}
      {finished && end?.kind === 'done' && <Notice tone={end.status === 'completed' ? 'emerald' : 'amber'} title={end.status === 'completed' ? '적용했습니다' : '일부 행을 반영하지 못했습니다'}>
        {end.status === 'completed' ? '카탈로그에 반영했습니다.' : '실패한 행만 다시 적용할 수 있습니다.'}</Notice>}
      {(phase !== 'ready') && live && <Counts items={[['반영', live.applied, 'success'], ['그대로', live.unchanged, 'neutral'], ['건너뜀', live.skipped, 'neutral'], ['제외', live.excluded, 'neutral'], ['실패', live.failed, live.failed > 0 ? 'danger' : 'neutral'],
        ...(live.unresolved > 0 ? [['정리 안 됨', live.unresolved, 'warning'] as const] : [])]} />}
      {ended && <p className="t-caption text-text-muted">작업 상태: {JOB_STATUS_LABEL[status]}</p>}
      {ended && <ImportRowsTable key={`result:${revision}`} mode="result" title="적용 결과 행" jobId={job.id} mapping={job.mapping} fetchDetail={fetchDetail} onDetail={() => undefined} />}
    </div>;
  } else body = <p className="text-sm text-text-muted">불러오는 중…</p>;

  // The loop's own terminal status stands in when re-reading the job failed, so the retry button is never lost.
  const partial = finished && (result?.job.status ?? (end?.kind === 'done' ? end.status : job?.status)) === 'partial_failure';
  const footer = <footer className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-card px-4 py-2.5">
    <div className="flex gap-2">
      {step === 2 && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setStep(1); }}>다시 붙여넣기</Button>}
      {(step === 3 || (step === 4 && phase === 'ready')) && <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep(previousStep(step, conflicts.length))}>이전</Button>}
    </div>
    <div className="flex items-center gap-2">
      {working && <span role="status" className="t-caption text-text-muted">{working}</span>}
      {step === 1 && <Button type="button" disabled={busy || text.trim() === '' || resume !== null} onClick={() => { void submit(); }}>검사</Button>}
      {step === 2 && <><Button type="button" variant="secondary" disabled={busy} onClick={() => { void recheck(); }}>다시 검사</Button>
        <Button type="button" disabled={busy} onClick={() => setStep(nextStep(2, counts.conflict))}>다음 단계</Button></>}
      {step === 3 && <Button type="button" data-next-step disabled={busy || unresolved.length > 0} onClick={() => setStep(nextStep(3, conflicts.length))}>다음 단계</Button>}
      {step === 4 && phase === 'ready' && <Button type="button" disabled={busy} onClick={() => { void runApply(); }}>적용</Button>}
      {step === 4 && phase === 'stopped' && end?.kind !== 'conflict' && <Button type="button" disabled={busy} onClick={() => { void runApply(); }}>다시 적용</Button>}
      {partial && <Button type="button" variant="secondary" disabled={busy} onClick={() => { void runApply(); }}>실패 행 다시 적용</Button>}
      {finished && <Button type="button" onClick={() => onExit(true)}>카탈로그로 돌아가기</Button>}
    </div>
  </footer>;

  return <div ref={rootRef} className="grid min-w-0 gap-3">
    <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-card px-4 py-3">
      <div><h2 className="text-base font-semibold text-text-primary">모델 가져오기</h2>
        <p className="t-caption text-text-muted">설비사명 · 공정명 · 모델명을 붙여넣어 검사한 뒤, 확인한 결과만 카탈로그에 반영합니다. 코드는 이름으로 자동 부여됩니다.</p></div>
      <Button type="button" variant="ghost" size="sm" disabled={phase === 'running'} onClick={requestExit}><X className="size-4" aria-hidden />목록으로</Button>
    </div>
    <StepBar step={step} conflicts={job ? conflicts.length : 1} />
    <section aria-labelledby={`${uid}-heading`} className="rounded-lg border border-border-subtle bg-surface-card p-4">
      <h3 id={`${uid}-heading`} ref={heading} tabIndex={-1} className="mb-3 text-sm font-semibold text-text-primary outline-none">{headingText}</h3>
      {error && <div className="mb-3"><Notice tone={error.busy ? 'amber' : 'red'} title={error.busy ? '지금은 검사할 수 없습니다' : '진행하지 못했습니다'}>{error.text}</Notice></div>}
      {body}
    </section>
    {footer}
    <AlertDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>가져오기를 그만둘까요?</AlertDialogTitle>
          <AlertDialogDescription>{phase === 'stopped' && ((progress?.counts.applied ?? plan?.detail.applyCounts.applied ?? 0) > 0 || job?.status === 'applying')
            ? '일부 행은 이미 카탈로그에 반영됐을 수 있습니다. 나가면 남은 행은 반영되지 않고 붙여넣은 내용은 사라집니다.'
            : '아직 적용하지 않아서 카탈로그는 바뀌지 않았습니다. 붙여넣은 내용과 검사 결과는 사라집니다.'}</AlertDialogDescription>
          {leaving?.error && <p role="alert" className="text-sm text-text-danger-label">{leaving.error}</p>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setLeaving(null)}>계속하기</AlertDialogCancel>
          {leaving?.error && <Button type="button" variant="secondary" onClick={() => { void confirmExit(true); }}>그래도 나가기</Button>}
          <AlertDialogAction onClick={event => { event.preventDefault(); void confirmExit(); }}>그만두기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
