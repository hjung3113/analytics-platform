/**
 * Sample Window 가져오기 (#1658 import PR): pick a `*.batch.json`, see the dev tool's import facts (`@eqv/core` `checkSampleWindowImport`,
 * EV ADR-0010), confirm, then upload through the SDK port (`PlatformAdapter.uploadFile`, ADR-0140) and import by id. The server judges again;
 * a reprocessed Data Generation of an active range lands `staged` and is replaced only through the 데이터 tab's 교체 (EV#105).
 */
import { useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { checkSampleWindowImport, type SampleWindowImportCheck } from '@eqv/core';
import { randomUuidV4 } from '@ap/contracts';
import { useMenuAction, usePlatform } from '@ap/kernel';
import { Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FieldList, FieldRow } from '@ap/ui';
import { SAMPLE_WINDOW_FILE_SUFFIX, WINDOW_IMPORT_PERMISSION, importSampleWindow, type SampleWindowRow } from '../../endpoints';
import {
  importProblemHint, importProblemLines, importRefusalProblems, uploadFailure, windowFileProblem, type ImportProblem, type ImportProblemLine,
} from '../../model/onboarding';
import { ShortRange } from './WallClock';

/** The file's text; `FileReader` where `Blob.text` is missing (an older DOM). */
const readText = (file: Blob): Promise<string> =>
  typeof file.text === 'function' ? file.text() : new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsText(file);
  });

/** Problem lines shown in the dialog; the rest are counted. */
const SHOWN_PROBLEMS = 20;
const TITLE = 'Sample Window 가져오기';
/** After the first import of an equipment the empty state's button is gone: the button above the new table takes focus (UX-9). */
let focusAfterFirstImport: string | null = null;

/** The import button (needs `eqv-studio:window-import` and the optional upload port); without the port a muted line says why. */
export function ImportWindowControl({ equipmentId, windows }: { equipmentId: string; windows: readonly SampleWindowRow[] }) {
  const { can, adapter } = usePlatform();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusAfterFirstImport !== equipmentId || windows.length === 0) return;
    focusAfterFirstImport = null;
    opener.current?.focus();
  }, [equipmentId, windows.length]);
  if (!can(WINDOW_IMPORT_PERMISSION)) return null;
  if (!adapter.uploadFile) return <span className="text-xs text-text-muted">이 환경에서는 파일을 올릴 수 없어 Sample Window를 가져올 수 없습니다.</span>;
  const imported = () => { if (windows.length === 0) focusAfterFirstImport = equipmentId; };
  return <>
    <Button ref={opener} size="toolbar" variant="primary" onClick={() => setOpen(true)}><FileUp className="size-3.5" aria-hidden />{TITLE}</Button>
    {open && <ImportWindowDialog equipmentId={equipmentId} windows={windows} onImported={imported} onClose={() => setOpen(false)} />}
  </>;
}

type Picked =
  | { file: File; key: string; problem: string }
  | { file: File; key: string; checking: true }
  | { file: File; key: string; raw: Blob; fileEquipmentId: string | null; check: SampleWindowImportCheck };
type Failure = { title: string; lines: ImportProblemLine[]; hint: string | null };

/** What the preview concludes from the check and the stored windows (the server would answer the same). */
type Verdict =
  | { kind: 'problems'; lines: ImportProblemLine[]; hint: string | null }
  | { kind: 'same' }
  | { kind: 'staged'; replaced: SampleWindowRow }
  | { kind: 'new' };

function verdictOf(check: SampleWindowImportCheck, windows: readonly SampleWindowRow[], ctx: { equipmentId: string; fileEquipmentId: string | null }): Verdict {
  const problems = (list: readonly ImportProblem[]): Verdict => ({
    kind: 'problems', lines: importProblemLines(list, { dataGeneration: check.summary?.dataGeneration ?? null }), hint: importProblemHint(list, ctx),
  });
  if (!check.ok) return problems(check.issues);
  if (check.same) return { kind: 'same' };
  // The check compares with every window but the retired; the server refuses a retired window's content (`file/retired`).
  if (windows.some((w) => w.state === 'retired' && w.hash === check.summary.hash)) return problems([{ code: 'retired', path: [] }]);
  const replaced = check.replaces.map((ref) => windows.find((w) => w.hash === ref.hash)).find((w) => w?.state === 'active') ?? null;
  if (replaced === null) return { kind: 'new' };
  // One staged replacement per active window: the server refuses a second (`file/staged_exists`).
  if (windows.some((w) => w.state === 'staged' && w.counterpart === replaced.hash)) return problems([{ code: 'staged_exists', path: [] }]);
  return { kind: 'staged', replaced };
}

const HEADLINE: Record<Verdict['kind'], (verdict: Verdict) => string> = {
  problems: (v) => `가져올 수 없습니다 · 문제 ${v.kind === 'problems' ? v.lines.length : 0}건`,
  same: () => '이미 있는 window입니다',
  staged: () => '교체 대기로 가져옵니다',
  new: () => '가져올 수 있습니다',
};

function ImportWindowDialog({ equipmentId, windows, onImported, onClose }: { equipmentId: string; windows: readonly SampleWindowRow[]; onImported(): void; onClose(): void }) {
  const { adapter, toast } = usePlatform();
  const run = useMenuAction(importSampleWindow);
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [uploading, setUploading] = useState(false);
  const busy = uploading || run.pending;
  // The upload in flight; leaving the page (Back while busy) aborts it. The import is a sent write: the Kernel never aborts one.
  const uploadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => uploadAbort.current?.abort(), []);

  const file = picked?.file ?? null;
  const checking = picked !== null && 'checking' in picked ? picked : null;
  useEffect(() => {
    if (checking === null) return undefined;
    const { file, key } = checking;
    let live = true;
    const settle = (next: Picked) => { if (live) setPicked((current) => (current?.key === key ? next : current)); };
    readText(file).then(async (text) => {
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { settle({ file, key, problem: 'JSON으로 읽을 수 없습니다.' }); return; }
      // The stored windows the server compares with: every one but the retired.
      const existing = windows.filter((w) => w.state !== 'retired').map(({ from, to, hash, timeDomain }) => ({ from, to, hash, timeDomain }));
      const check = await checkSampleWindowImport(raw, { equipmentId, existing, sameRangeReplaces: true });
      const named = typeof raw === 'object' && raw !== null && 'equipmentId' in raw && typeof raw.equipmentId === 'string' ? raw.equipmentId : null;
      settle({ file, key, raw: file.type === 'application/json' ? file : new Blob([text], { type: 'application/json' }), fileEquipmentId: named, check });
    }, () => settle({ file, key, problem: '파일을 읽을 수 없습니다.' }))
      // Anything else (no `crypto.subtle` outside a secure context, a validator throw) settles too, never a stuck «검사 중…».
      .catch(() => settle({ file, key, problem: '파일을 검사하지 못했습니다.' }));
    return () => { live = false; };
  }, [checking, equipmentId, windows]);

  const choose = (next: File) => {
    setFailure(null);
    const problem = windowFileProblem(next);
    setPicked(problem ? { file: next, key: randomUuidV4(), problem } : { file: next, key: randomUuidV4(), checking: true });
  };
  const checked = picked !== null && 'check' in picked ? picked : null;
  const verdict = checked ? verdictOf(checked.check, windows, { equipmentId, fileEquipmentId: checked.fileEquipmentId }) : null;
  const ready = checked !== null && (verdict?.kind === 'new' || verdict?.kind === 'staged') ? checked : null;

  const confirm = async () => {
    if (!ready || !adapter.uploadFile || busy) return;
    setFailure(null);
    setUploading(true);
    const abort = new AbortController();
    uploadAbort.current = abort;
    try {
      // One key per picked file: a retry of the same file is a replay, never a second stored object.
      const uploaded = await adapter.uploadFile({ file: ready.raw, name: ready.file.name, idempotencyKey: ready.key }, abort.signal);
      if (abort.signal.aborted) return;
      if (uploaded.outcome !== 'ok' || uploaded.data === null) { setFailure({ title: uploadFailure(uploaded), lines: [], hint: null }); return; }
      setUploading(false);
      const result = await run.run({ equipmentId, uploadId: uploaded.data.id });
      if (result.outcome === 'ok') {
        toast(result.data?.state === 'staged' ? 'Sample Window를 교체 대기로 가져왔습니다' : 'Sample Window를 가져왔습니다', 'info');
        onImported();
        onClose();
        return;
      }
      if (result.outcome === 'invalid') {
        const problems = importRefusalProblems(result.fieldErrors);
        setFailure({ title: '서버가 가져오기를 거부했습니다', lines: importProblemLines(problems), hint: importProblemHint(problems, { equipmentId, fileEquipmentId: ready.fileEquipmentId }) });
      } else setFailure({ title: result.outcome === 'forbidden' ? '권한이 없어 가져오지 못했습니다.' : '가져오지 못했습니다. 다시 시도하세요.', lines: [], hint: null });
    } catch {
      if (!abort.signal.aborted) setFailure({ title: '가져오지 못했습니다. 다시 시도하세요.', lines: [], hint: null });
    } finally {
      if (uploadAbort.current === abort) uploadAbort.current = null;
      setUploading(false);
    }
  };

  // The result headline, always in one live region (UX-6); a pre-check problem and a failure announce themselves as alerts.
  const headline = picked === null || 'problem' in picked ? '' : 'checking' in picked ? '검사 중…' : verdict ? HEADLINE[verdict.kind](verdict) : '';
  // Why 가져오기 is disabled: the pre-check problem, the hint under the problem list, or the headline itself.
  const describedBy = picked === null ? 'import-window-reason'
    : 'problem' in picked ? 'import-window-problem'
      : verdict?.kind === 'problems' && verdict.hint ? 'import-window-hint' : 'import-window-status';
  return <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <DialogContent className="break-keep">
      <DialogHeader>
        <DialogTitle>{TITLE}</DialogTitle>
        <DialogDescription>원천 변환기가 만든 *{SAMPLE_WINDOW_FILE_SUFFIX} 파일을 고릅니다. 가져오기는 값을 고치지 않고, 같은 구간을 다시 처리한 Generation은 교체 대기가 됩니다.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3" aria-busy={busy || undefined}>
        <div className="flex min-w-0 items-center gap-2">
          <input ref={input} type="file" accept={`${SAMPLE_WINDOW_FILE_SUFFIX},application/json`} className="sr-only" tabIndex={-1} aria-label="Sample Window 파일"
            onChange={(event) => { const next = event.target.files?.[0]; if (next) choose(next); event.target.value = ''; }} />
          <Button size="toolbar" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>파일 고르기</Button>
          {file && <span className="min-w-0 truncate text-xs text-text-secondary" title={file.name}>{file.name} · {(file.size / 1024).toFixed(1)} KiB</span>}
        </div>
        {picked && 'problem' in picked && <Callout tone="red"><span id="import-window-problem" role="alert">{picked.problem}</span></Callout>}
        <p id="import-window-status" role="status" className={headline === '' ? 'sr-only' : 'text-xs font-medium'}>{headline}</p>
        {checked && verdict && <Preview check={checked.check} verdict={verdict} />}
        {failure && <Callout tone="red" title={failure.lines.length > 0 ? failure.title : undefined}>
          {failure.lines.length > 0 ? <div role="alert"><ProblemList lines={failure.lines} />{failure.hint && <p className="mt-1 text-xs">{failure.hint}</p>}</div>
            : <span role="alert">{failure.title}</span>}
        </Callout>}
        {picked === null && <p id="import-window-reason" className="text-xs text-text-muted">파일을 고르세요.</p>}
      </div>
      <DialogFooter>
        <Button size="toolbar" variant="secondary" disabled={busy} onClick={onClose}>취소</Button>
        <Button size="toolbar" variant="primary" disabled={ready === null || busy} aria-describedby={ready === null ? describedBy : undefined} onClick={() => void confirm()}>
          {uploading ? '올리는 중…' : run.pending ? '가져오는 중…' : '가져오기'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** One Korean line per problem code; the paths and original messages only inside the collapsed «자세히». */
function ProblemList({ lines }: { lines: readonly ImportProblemLine[] }) {
  return <>
    <ul className="space-y-0.5 text-xs">{lines.slice(0, SHOWN_PROBLEMS).map((line) => <li key={line.code}>{line.text}</li>)}</ul>
    {lines.length > SHOWN_PROBLEMS && <p className="text-xs">외 {lines.length - SHOWN_PROBLEMS}건</p>}
    {lines.some((line) => line.details.length > 0) && <details className="mt-1 text-xs">
      <summary className="cursor-pointer">자세히</summary>
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto font-mono">{lines.flatMap((line) => line.details).map((detail, i) => <li key={i} className="break-all">{detail}</li>)}</ul>
    </details>}
  </>;
}

function Preview({ check, verdict }: { check: SampleWindowImportCheck; verdict: Verdict }) {
  const { summary } = check;
  const warnings = importProblemLines(check.warnings);
  return <div className="space-y-2">
    {summary && <FieldList>
      <FieldRow layout="property" label="구간"><ShortRange from={summary.from} to={summary.to} /></FieldRow>
      <FieldRow layout="property" label="Generation" mono>{summary.dataGeneration}</FieldRow>
      <FieldRow layout="property" label="이벤트">{`${summary.occurrences}건`}</FieldRow>
      <FieldRow layout="property" label="timeDomain" mono>{summary.timeDomain}</FieldRow>
    </FieldList>}
    {verdict.kind === 'staged' && <Callout tone="amber">같은 구간의 사용 중 window({verdict.replaced.dataGeneration})를 다시 처리한 Generation입니다. 바꾸려면 가져온 뒤 데이터 탭에서 «교체»를 누르세요.</Callout>}
    {verdict.kind === 'problems' && <Callout tone="red">
      <ProblemList lines={verdict.lines} />
      {verdict.hint && <p id="import-window-hint" className="mt-1 text-xs">{verdict.hint}</p>}
    </Callout>}
    {warnings.length > 0 && <Callout tone="amber" title={`경고 ${warnings.length}건`}><ProblemList lines={warnings} /></Callout>}
  </div>;
}
