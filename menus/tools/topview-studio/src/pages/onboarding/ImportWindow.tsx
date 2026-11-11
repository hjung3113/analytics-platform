/**
 * Sample Window 가져오기 (#1658 import PR): pick a `*.batch.json`, see the dev tool's import facts (`@eqv/core` `checkSampleWindowImport`,
 * EV ADR-0010), confirm, then upload through the SDK port (`PlatformAdapter.uploadFile`, ADR-0140) and import by id. The server judges again;
 * a reprocessed Data Generation of an active range lands `staged` and is replaced only through the 데이터 tab's 교체 (EV#105).
 */
import { useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { checkSampleWindowImport, type SampleWindowImportCheck } from '@eqv/core';
import { useMenuAction, usePlatform } from '@ap/kernel';
import { Button, Callout, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FieldList, FieldRow } from '@ap/ui';
import { SAMPLE_WINDOW_FILE_SUFFIX, WINDOW_IMPORT_PERMISSION, importSampleWindow, type SampleWindowRow } from '../../endpoints';
import { fieldErrorLine, uploadFailure, windowFileProblem } from '../../model/onboarding';
import { NoBreakStamps } from './WallClock';

/** The file's text; `FileReader` where `Blob.text` is missing (an older DOM). */
const readText = (file: Blob): Promise<string> =>
  typeof file.text === 'function' ? file.text() : new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsText(file);
  });

/** Problems listed in the dialog; the rest are counted. */
const SHOWN_PROBLEMS = 20;
const TITLE = 'Sample Window 가져오기';

/** The import button (needs `eqv-studio:window-import` and the optional upload port); without the port a muted line says why. */
export function ImportWindowControl({ equipmentId, windows }: { equipmentId: string; windows: readonly SampleWindowRow[] }) {
  const { can, adapter } = usePlatform();
  const [open, setOpen] = useState(false);
  if (!can(WINDOW_IMPORT_PERMISSION)) return null;
  if (!adapter.uploadFile) return <span className="text-xs text-text-muted">이 환경에서는 파일을 올릴 수 없어 Sample Window를 가져올 수 없습니다.</span>;
  return <>
    <Button size="toolbar" variant="primary" onClick={() => setOpen(true)}><FileUp className="size-3.5" aria-hidden />{TITLE}</Button>
    {open && <ImportWindowDialog equipmentId={equipmentId} windows={windows} onClose={() => setOpen(false)} />}
  </>;
}

type Picked =
  | { file: File; key: string; problem: string }
  | { file: File; key: string; checking: true }
  | { file: File; key: string; raw: Blob; check: SampleWindowImportCheck };
type Failure = { title: string; lines: string[] };

function ImportWindowDialog({ equipmentId, windows, onClose }: { equipmentId: string; windows: readonly SampleWindowRow[]; onClose(): void }) {
  const { adapter, toast } = usePlatform();
  const run = useMenuAction(importSampleWindow);
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [uploading, setUploading] = useState(false);
  const busy = uploading || run.pending;

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
      settle({ file, key, raw: file.type === 'application/json' ? file : new Blob([text], { type: 'application/json' }), check });
    }, () => settle({ file, key, problem: '파일을 읽을 수 없습니다.' }));
    return () => { live = false; };
  }, [checking, equipmentId, windows]);

  const choose = (next: File) => {
    setFailure(null);
    const problem = windowFileProblem(next);
    setPicked(problem ? { file: next, key: crypto.randomUUID(), problem } : { file: next, key: crypto.randomUUID(), checking: true });
  };
  const ready = picked !== null && 'check' in picked && picked.check.ok ? picked : null;

  const confirm = async () => {
    if (!ready || !adapter.uploadFile || busy) return;
    setFailure(null);
    setUploading(true);
    try {
      // One key per picked file: a retry of the same file is a replay, never a second stored object.
      const uploaded = await adapter.uploadFile({ file: ready.raw, name: ready.file.name, idempotencyKey: ready.key });
      if (uploaded.outcome !== 'ok' || uploaded.data === null) { setFailure({ title: uploadFailure(uploaded), lines: [] }); return; }
      setUploading(false);
      const result = await run.run({ equipmentId, uploadId: uploaded.data.id });
      if (result.outcome === 'ok') {
        toast(result.data?.state === 'staged' ? 'Sample Window를 교체 대기로 가져왔습니다' : 'Sample Window를 가져왔습니다', 'info');
        onClose();
        return;
      }
      setFailure(result.outcome === 'invalid' ? { title: '서버가 가져오기를 거부했습니다', lines: result.fieldErrors.map(fieldErrorLine) }
        : { title: result.outcome === 'forbidden' ? '권한이 없어 가져오지 못했습니다.' : '가져오지 못했습니다. 다시 시도하세요.', lines: [] });
    } catch {
      setFailure({ title: '가져오지 못했습니다. 다시 시도하세요.', lines: [] });
    } finally {
      setUploading(false);
    }
  };

  // Why 가져오기 is disabled: the pre-check problem itself, or one muted line.
  const reason = picked === null ? '파일을 고르세요.' : 'problem' in picked ? null : 'checking' in picked ? '검사 중입니다.' : picked.check.ok ? null : '문제를 고친 파일을 고르세요.';
  const describedBy = picked !== null && 'problem' in picked ? 'import-window-problem' : reason ? 'import-window-reason' : undefined;
  return <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
    <DialogContent className="break-keep">
      <DialogHeader>
        <DialogTitle>{TITLE}</DialogTitle>
        <DialogDescription>원천 변환기가 만든 {SAMPLE_WINDOW_FILE_SUFFIX} 파일을 고릅니다. 가져오기는 값을 고치지 않고, 같은 구간을 다시 처리한 Generation은 교체 대기가 됩니다.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <input ref={input} type="file" accept={`${SAMPLE_WINDOW_FILE_SUFFIX},application/json`} className="sr-only" tabIndex={-1} aria-label="Sample Window 파일"
            onChange={(event) => { const next = event.target.files?.[0]; if (next) choose(next); event.target.value = ''; }} />
          <Button size="toolbar" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>파일 고르기</Button>
          {file && <span className="min-w-0 truncate text-xs text-text-secondary" title={file.name}>{file.name} · {(file.size / 1024).toFixed(1)} KiB</span>}
        </div>
        {picked && 'problem' in picked && <Callout tone="red"><span id="import-window-problem" role="alert">{picked.problem}</span></Callout>}
        {picked && 'checking' in picked && <p role="status" className="text-xs text-text-secondary">검사 중…</p>}
        {picked && 'check' in picked && <Preview check={picked.check} windows={windows} />}
        {failure && (failure.lines.length > 0
          ? <Callout tone="red" title={failure.title}><ul role="alert" className="space-y-0.5 font-mono text-xs">{failure.lines.map((line, i) => <li key={i}>{line}</li>)}</ul></Callout>
          : <Callout tone="red"><span role="alert">{failure.title}</span></Callout>)}
        {reason && <p id="import-window-reason" className="text-xs text-text-muted">{reason}</p>}
      </div>
      <DialogFooter>
        <Button size="toolbar" variant="secondary" disabled={busy} onClick={onClose}>취소</Button>
        <Button size="toolbar" variant="primary" disabled={ready === null || busy} aria-describedby={ready === null ? describedBy : undefined} onClick={() => void confirm()}>가져오기</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Preview({ check, windows }: { check: SampleWindowImportCheck; windows: readonly SampleWindowRow[] }) {
  const { summary } = check;
  const replaced = check.ok ? check.replaces.map((ref) => windows.find((w) => w.hash === ref.hash)).find((w) => w?.state === 'active') ?? null : null;
  const issues = check.ok ? [] : check.issues;
  return <div className="space-y-2">
    {summary && <FieldList>
      <FieldRow layout="property" label="구간"><NoBreakStamps text={`${summary.from} – ${summary.to}`} /></FieldRow>
      <FieldRow layout="property" label="Generation" mono>{summary.dataGeneration}</FieldRow>
      <FieldRow layout="property" label="Occurrence">{`${summary.occurrences}개`}</FieldRow>
      <FieldRow layout="property" label="timeDomain" mono>{summary.timeDomain}</FieldRow>
    </FieldList>}
    {check.ok && check.same && <Callout tone="blue">같은 내용의 window가 이미 있습니다. 가져와도 바뀌지 않습니다.</Callout>}
    {check.ok && !check.same && replaced && <Callout tone="amber">같은 구간의 사용 중 window({replaced.dataGeneration})를 다시 처리한 Generation입니다. 교체 대기로 가져옵니다. 바꾸려면 데이터 탭에서 «교체»를 누르세요.</Callout>}
    {issues.length > 0 && <Callout tone="red" title={`가져올 수 없습니다 · 문제 ${issues.length}건`}>
      <ul className="space-y-0.5 text-xs">{issues.slice(0, SHOWN_PROBLEMS).map((issue, i) => <li key={i}><span className="font-mono">{fieldErrorLine(issue)}</span> — {issue.message}</li>)}</ul>
      {issues.length > SHOWN_PROBLEMS && <p className="text-xs">외 {issues.length - SHOWN_PROBLEMS}건</p>}
    </Callout>}
    {check.warnings.length > 0 && <Callout tone="amber" title={`경고 ${check.warnings.length}건`}>
      <ul className="space-y-0.5 text-xs">{check.warnings.slice(0, SHOWN_PROBLEMS).map((warning, i) => <li key={i}><span className="font-mono">{fieldErrorLine(warning)}</span> — {warning.message}</li>)}</ul>
    </Callout>}
  </div>;
}
