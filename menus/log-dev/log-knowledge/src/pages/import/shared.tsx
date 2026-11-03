/** PROTOTYPE shared step bodies (#1195, never merged). Layout stays per variant; these are the five steps' contents. Read-only: nothing is saved. */
import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Info, Upload } from 'lucide-react';
import { Button, Callout, ProgressMeter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge, cn } from '@ap/ui';
import {
  APPLY_LABEL, DEFAULT_MAPPING, DEMO_RESOLUTIONS, ERROR_LABEL, FACTS, FIELDS, HEADERS, LIMITS, PLAN_LABEL, PLAN_TONE, ROWS, STATUS_LABEL, applyStatusOf, planCounts,
  type ApplyStatus, type FieldId, type ImportRow, type JobStatus, type PlanState, type ResultState, type Resolution,
} from './fixture';

export type Resolutions = Record<number, { resolution: Resolution; mapTargetId?: string }>;

export function useResolutions(initial: Resolutions = DEMO_RESOLUTIONS) {
  const [resolutions, setResolutions] = useState<Resolutions>(initial);
  const set = (rowNo: number, value: Resolutions[number] | null) => setResolutions(r => {
    const next = { ...r };
    if (value) next[rowNo] = value; else delete next[rowNo];
    return next;
  });
  return { resolutions, set };
}

export function statusTone(s: JobStatus): 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  return s === 'completed' ? 'success' : s === 'partial_failure' || s === 'review_required' ? 'warning' : s === 'failed' ? 'danger' : s === 'cancelled' ? 'neutral' : 'info';
}

export function StatusPill({ status }: { status: JobStatus }) {
  return <StatusBadge tone={statusTone(status)} dot>{STATUS_LABEL[status]} <span className="t-mono opacity-70">{status}</span></StatusBadge>;
}

/** §15.4 header facts: shown on every step. */
export function JobFacts({ status, dense = false }: { status: JobStatus; dense?: boolean }) {
  const items: [string, ReactNode][] = [
    ['파일명', <span key="f" className="t-mono">{FACTS.fileName}</span>], ['시트', FACTS.sheet], ['원천', FACTS.source], ['검사 시각', <span key="t" className="tabular">{FACTS.checkedAt}</span>],
    ['총 행 수', <span key="n" className="tabular">{FACTS.totalRows}행</span>], ['처리 상태', <StatusPill key="s" status={status} />],
  ];
  return <dl className={cn('grid gap-x-5 gap-y-1.5', dense ? 'grid-cols-2' : 'grid-cols-3 xl:grid-cols-6')}>
    {items.map(([k, v]) => <div key={k} className="min-w-0"><dt className="t-caption text-text-muted">{k}</dt><dd className="break-words text-sm text-text-primary">{v}</dd></div>)}
  </dl>;
}

export function NothingSaved() {
  return <Callout tone="blue" icon={<Info className="size-4" aria-hidden />} title="아직 아무것도 저장되지 않았습니다 (저장 건수 0)">
    이 단계까지는 가져온 내용을 검사만 합니다. 카탈로그는 「적용 승인」 뒤에만 바뀌고, 승인한 계획만 반영됩니다.
  </Callout>;
}

/* ① 파일 선택 */
export function FileStep({ onNext }: { onNext?: () => void }) {
  return <div className="grid gap-4">
    <div className="grid place-items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-raised px-6 py-8 text-center">
      <Upload className="size-6 text-text-muted" aria-hidden />
      <p className="text-sm text-text-primary">CSV 또는 XLSX 파일을 끌어 놓거나 <span className="font-semibold text-text-info-label">파일 선택</span></p>
      <ul className="t-caption flex flex-wrap justify-center gap-x-4 text-text-muted">{LIMITS.map(l => <li key={l}>{l}</li>)}</ul>
    </div>
    <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface-card px-3 py-2">
      <FileSpreadsheet className="size-5 text-text-secondary" aria-hidden />
      <div className="min-w-0 flex-1"><p className="t-mono truncate text-sm text-text-primary">{FACTS.fileName}</p><p className="t-caption text-text-muted">{FACTS.fileMeta} · 데이터 {FACTS.totalRows}행 · 열 5개 · 업로드 완료</p></div>
      <StatusBadge tone="success">형식 통과</StatusBadge>
    </div>
    <div className="grid gap-1.5">
      <span className="t-caption text-text-muted">가져올 대상</span>
      <div role="radiogroup" aria-label="가져올 대상" className="flex flex-wrap gap-2">
        {['제조사', '공정', '모델', 'SW 버전'].map(l => <span key={l} role="radio" aria-checked={l === '모델'} tabIndex={0}
          className={cn('rounded-pill border px-3 py-1 text-sm', l === '모델' ? 'border-accent-primary bg-accent-primary-soft font-semibold text-text-info-label' : 'border-border-subtle text-text-secondary')}>{l}</span>)}
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm"><Download className="size-3.5" aria-hidden />모델 템플릿 받기</Button>
      <span className="t-caption text-text-muted">수식은 계산하지 않고 값으로만 읽습니다. 병합 셀·수식 셀은 빈 값이 되고 검증에서 알려 줍니다.</span>
      {onNext && <Button type="button" className="ml-auto" onClick={onNext}>열 매핑 <ArrowRight className="size-4" aria-hidden /></Button>}
    </div>
  </div>;
}

/* ② 열 매핑 */
export function MapStep({ duplicate = false }: { duplicate?: boolean }) {
  const [mapping, setMapping] = useState<Record<FieldId, string>>(duplicate ? { ...DEFAULT_MAPPING, model_name: 'ModelNo' } : DEFAULT_MAPPING);
  const used = Object.values(mapping);
  const dupHeader = used.find((h, i) => h !== '' && used.indexOf(h) !== i);
  const missing = FIELDS.filter(f => f.required && !mapping[f.id]);
  const sample = ROWS.slice(0, 4);
  return <div className="grid gap-4">
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
      <section aria-label="원본 파일 열" className="min-w-0 overflow-hidden rounded-md border border-border-subtle">
        <h3 className="t-caption border-b border-border-subtle bg-surface-raised px-3 py-1.5 font-semibold text-text-secondary">원본 열 · 샘플 {sample.length}행</h3>
        <table className="w-full text-sm"><thead><tr className="text-left text-text-muted">{HEADERS.map(h => <th key={h} className="t-mono px-3 py-1.5 font-medium">{h}</th>)}</tr></thead>
          <tbody>{sample.map(r => <tr key={r.rowNo} className="border-t border-border-subtle">{HEADERS.map(h => <td key={h} className="t-mono truncate px-3 py-1 text-text-secondary">{r.raw[h] || '—'}</td>)}</tr>)}</tbody></table>
      </section>
      <section aria-label="대상 필드" className="grid content-start gap-2.5 rounded-md border border-border-subtle p-3">
        <h3 className="t-caption font-semibold text-text-secondary">대상 필드 (모델)</h3>
        {FIELDS.map(f => <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2">
          <span className="min-w-0 text-sm text-text-primary">{f.label} {f.required ? <span className="text-text-danger-label" aria-label="필수">*</span> : <span className="t-caption text-text-muted">선택</span>}</span>
          <Select value={mapping[f.id] || '__none'} onValueChange={v => setMapping(m => ({ ...m, [f.id]: v === '__none' ? '' : v }))}>
            <SelectTrigger aria-label={`${f.label} 원본 열`} className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__none">— 매핑 안 함</SelectItem>{HEADERS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
        </div>)}
        <p className="t-caption text-text-muted">매핑하지 않은 원본 열(Memo)은 가져오지 않습니다.</p>
      </section>
    </div>
    {dupHeader && <div role="alert"><Callout tone="red" icon={<AlertTriangle className="size-4" aria-hidden />} title="같은 원본 열을 두 필드에 매핑했습니다 (duplicate_source)">원본 열 {dupHeader}은(는) 한 필드에만 연결할 수 있습니다. 하나를 바꾸면 검증으로 넘어갑니다.</Callout></div>}
    {!dupHeader && missing.length === 0 && <p className="t-caption flex items-center gap-1.5 text-text-success-label"><CheckCircle2 className="size-3.5" aria-hidden />필수 필드 3개 모두 매핑됨 · 다시 매핑하면 이전 해결은 모두 무효가 됩니다(검증 세대 증가)</p>}
  </div>;
}

/* ③ 검증 결과 */
export function PlanBadge({ state }: { state: PlanState }) {
  return <StatusBadge tone={PLAN_TONE[state]}>{PLAN_LABEL[state]}</StatusBadge>;
}

export function ErrorLine({ row }: { row: ImportRow }) {
  if (!row.error) return null;
  return <span className="text-text-danger-label">{row.error.column} · {ERROR_LABEL[row.error.code]} <span className="t-mono opacity-70">{row.error.code}</span></span>;
}

export function ValidateStep({ filter, onFilter, max = 12 }: { filter: PlanState | 'all'; onFilter: (f: PlanState | 'all') => void; max?: number }) {
  const counts = planCounts();
  const rows = (filter === 'all' ? ROWS : ROWS.filter(r => r.planState === filter)).slice(0, max);
  const order: PlanState[] = ['new', 'unchanged', 'update', 'conflict', 'error'];
  return <div className="grid gap-3">
    <NothingSaved />
    <div role="group" aria-label="계획 상태 요약" className="grid grid-cols-5 gap-2">
      {order.map(s => <button key={s} type="button" aria-pressed={filter === s} onClick={() => onFilter(filter === s ? 'all' : s)}
        className={cn('rounded-md border px-3 py-2 text-left', filter === s ? 'border-accent-primary bg-accent-primary-soft' : 'border-border-subtle bg-surface-card hover:bg-surface-row-hover')}>
        <span className="t-caption block text-text-muted">{PLAN_LABEL[s]}</span><span className="tabular text-xl font-semibold text-text-primary">{counts[s]}</span>
      </button>)}
    </div>
    <div className="overflow-hidden rounded-md border border-border-subtle">
      <table className="w-full text-sm"><thead className="bg-surface-raised text-left text-text-muted"><tr>
        <th className="t-caption px-3 py-1.5 font-medium">행</th><th className="t-caption px-3 py-1.5 font-medium">결과</th><th className="t-caption px-3 py-1.5 font-medium">제조사 코드</th>
        <th className="t-caption px-3 py-1.5 font-medium">모델 코드</th><th className="t-caption px-3 py-1.5 font-medium">이름</th><th className="t-caption px-3 py-1.5 font-medium">원인 (열 · 사유)</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.rowNo} className="border-t border-border-subtle">
          <td className="tabular px-3 py-1 text-text-muted">{r.rowNo}</td><td className="px-3 py-1"><PlanBadge state={r.planState} /></td>
          <td className="t-mono px-3 py-1">{r.raw.Maker || <span className="text-text-danger-label">(비어 있음)</span>}</td><td className="t-mono px-3 py-1">{r.raw.ModelNo}</td>
          <td className="truncate px-3 py-1">{r.raw.Name}</td><td className="px-3 py-1"><ErrorLine row={r} />{r.planState === 'conflict' && <span className="text-text-warning-label">기존 항목이 비활성 · 충돌 해결에서 선택</span>}{r.planState === 'update' && <span className="text-text-secondary">이름·공정이 기존과 다름</span>}</td></tr>)}</tbody></table>
      <div className="t-caption flex items-center justify-between border-t border-border-subtle bg-surface-raised px-3 py-1.5 text-text-muted">
        <span>{rows.length}행 표시 · 전체 {ROWS.length}행 (행 가상화)</span>
        <Button type="button" variant="link" size="sm"><Download className="size-3.5" aria-hidden />검증 리포트 CSV</Button></div>
    </div>
  </div>;
}

/* ④ 충돌 해결 */
export function ResolveStep({ resolutions, set, selected, onSelect }: { resolutions: Resolutions; set: (rowNo: number, v: Resolutions[number] | null) => void; selected: number; onSelect: (n: number) => void }) {
  const conflicts = ROWS.filter(r => r.planState === 'conflict');
  const row = conflicts.find(r => r.rowNo === selected) ?? conflicts[0]!;
  const res = resolutions[row.rowNo];
  const counts = planCounts();
  const unresolved = conflicts.filter(r => !resolutions[r.rowNo]).length;
  const skipped = Object.values(resolutions).filter(r => r.resolution === 'skip').length;
  const choice = (value: Resolution, label: string, enabled = true, hint?: string) => <button type="button" disabled={!enabled} aria-pressed={res?.resolution === value} title={hint}
    onClick={() => set(row.rowNo, res?.resolution === value ? null : { resolution: value, mapTargetId: value === 'map' ? row.mapChoices?.[0]?.id : undefined })}
    className={cn('rounded-md border px-3 py-1.5 text-sm disabled:opacity-50', res?.resolution === value ? 'border-accent-primary bg-accent-primary-soft font-semibold text-text-info-label' : 'border-border-subtle hover:bg-surface-row-hover')}>{label}</button>;
  return <div className="grid gap-3">
    <div className="grid grid-cols-[13rem_minmax(0,1fr)] gap-4">
      <ul aria-label="충돌 행" className="grid content-start gap-1.5">
        {conflicts.map(r => <li key={r.rowNo}><button type="button" aria-current={r.rowNo === row.rowNo} onClick={() => onSelect(r.rowNo)}
          className={cn('w-full rounded-md border px-3 py-2 text-left', r.rowNo === row.rowNo ? 'border-accent-primary bg-accent-primary-soft' : 'border-border-subtle hover:bg-surface-row-hover')}>
          <span className="t-mono block text-sm">{r.raw.ModelNo}</span><span className="t-caption text-text-muted">{r.rowNo}행 · {resolutions[r.rowNo] ? (resolutions[r.rowNo]!.resolution === 'skip' ? '건너뜀' : '기존 항목에 매핑') : <span className="text-text-danger-label">미해결</span>}</span>
        </button></li>)}
        <li className="t-caption px-1 text-text-muted">신규 후보 {counts.new}행은 <b>신규 생성</b>이 기본값입니다.</li>
      </ul>
      <section aria-label={`${row.raw.ModelNo} 비교`} className="grid min-w-0 gap-3">
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border-subtle">
          {[['파일 값 (원본)', row.raw.Name, row.raw.Process || '—', '활성으로 가져옴'], ['현재 카탈로그', row.current!.name, row.current!.processes || '—', `비활성 · 버전 ${row.current!.rowVersion}`]].map(([h, n, p, a], i) => <div key={h} className={cn('grid gap-1 p-3', i === 1 && 'border-l border-border-subtle bg-surface-raised')}>
            <span className="t-caption font-semibold text-text-secondary">{h}</span>
            <span className="t-mono text-sm">{row.raw.Maker} / {row.raw.ModelNo}</span>
            <span className={cn('text-sm', n !== (i ? row.raw.Name : row.current!.name) ? '' : n !== (i ? row.current!.name : row.raw.Name) && 'bg-accent-warn-soft')}>이름 · {n}</span>
            <span className="text-sm">공정 · {p}</span><span className="t-caption text-text-muted">{a}</span></div>)}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="해결 방법">
          {choice('skip', '건너뛰기')}{choice('map', '기존 항목에 매핑')}{choice('create', '신규 생성', false, '키가 이미 있는 충돌 행에는 쓸 수 없습니다 (신규 후보 행만)')}
          {res?.resolution === 'map' && <Select value={res.mapTargetId} onValueChange={v => set(row.rowNo, { resolution: 'map', mapTargetId: v })}>
            <SelectTrigger aria-label="매핑할 기존 항목" className="h-8 w-60"><SelectValue /></SelectTrigger>
            <SelectContent>{row.mapChoices!.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select>}
        </div>
        <p className="t-caption text-text-muted">매핑 대상은 같은 제조사의 활성 모델만 고를 수 있습니다. 덮어쓰기·자동 병합은 없습니다. 「기존 항목에 매핑」은 외부 키 별칭을 기록합니다. 「중단」은 없고, 가져오기 전체 취소는 적용 전에만 가능합니다.</p>
      </section>
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm">
      <span className="font-semibold">적용 계획</span>
      <span>신규 <b className="tabular">{counts.new}</b></span><span>갱신 <b className="tabular">{counts.update}</b></span><span>건너뜀 <b className="tabular">{skipped}</b></span>
      <span className={unresolved ? 'text-text-warning-label' : ''}>미해결 충돌 <b className="tabular">{unresolved}</b></span><span className="text-text-muted">오류 {counts.error}행은 제외 · 기존 일치 {counts.unchanged}행은 유지</span>
    </div>
  </div>;
}

/* ⑤ 적용 결과 */
const APPLY_TONE: Record<ApplyStatus, 'success' | 'neutral' | 'warning' | 'danger'> = { applied: 'success', unchanged: 'neutral', skipped: 'neutral', excluded: 'neutral', unresolved: 'warning', conflict: 'danger', failed: 'danger' };

export function resultSummary(resolutions: Resolutions, scenario: ResultState) {
  const c: Record<ApplyStatus, number> = { applied: 0, unchanged: 0, skipped: 0, excluded: 0, unresolved: 0, conflict: 0, failed: 0 };
  let remaining = 0;
  for (const r of ROWS) { const s = applyStatusOf(r, resolutions, scenario); if (s.reason === '__pending') remaining += 1; else c[s.status] += 1; }
  return { counts: c, remaining };
}

export function ResultStep({ resolutions, scenario, max = 10 }: { resolutions: Resolutions; scenario: ResultState; max?: number }) {
  const { counts, remaining } = resultSummary(resolutions, scenario);
  const done = ROWS.length - remaining;
  const partial = scenario === 'partial_failure';
  const order: ApplyStatus[] = ['applied', 'unchanged', 'skipped', 'excluded', 'unresolved', 'conflict', 'failed'];
  const listed = ROWS.map(r => ({ r, s: applyStatusOf(r, resolutions, scenario) })).filter(x => (partial ? ['failed', 'conflict', 'skipped', 'excluded'].includes(x.s.status) : scenario === 'applying' ? true : x.s.status !== 'unchanged')).slice(0, max);
  return <div className="grid gap-3">
    {scenario === 'applying' && <div className="grid gap-1.5"><span className="text-sm">적용 중 — 행당 한 트랜잭션, 시간 예산마다 이어서 호출합니다</span><ProgressMeter value={done} max={ROWS.length} tone="primary" semantics={{ role: 'progressbar', label: '적용 진행' }} /><span className="t-caption tabular text-text-muted">{done} / {ROWS.length}행 처리 · 남은 {remaining}행</span></div>}
    {partial && <Callout tone="amber" icon={<AlertTriangle className="size-4" aria-hidden />} title="일부만 반영되었습니다 (partial_failure)"
      action={<Button size="sm"><ArrowRight className="size-3.5" aria-hidden />실패 {counts.failed}행 다시 시도</Button>}>
      반영 {counts.applied}행은 그대로 유지됩니다. 다시 시도는 실패 {counts.failed}행만 대상이며, 충돌 {counts.conflict}행은 재시도하지 않습니다(최종).</Callout>}
    {scenario === 'completed' && <Callout tone="emerald" icon={<CheckCircle2 className="size-4" aria-hidden />} title="가져오기가 완료되었습니다 (completed)">실패·충돌 행이 없습니다. 감사 기록에 Import {`imp-0412`}의 행 번호와 함께 남았습니다.</Callout>}
    <div role="group" aria-label="적용 집계" className="grid grid-cols-7 gap-2">
      {order.map(s => <div key={s} className="rounded-md border border-border-subtle bg-surface-card px-2.5 py-2"><span className="t-caption block truncate text-text-muted">{APPLY_LABEL[s]}</span><span className={cn('tabular text-xl font-semibold', counts[s] && (s === 'failed' || s === 'conflict') ? 'text-text-danger-label' : 'text-text-primary')}>{counts[s]}</span></div>)}
    </div>
    <div className="overflow-hidden rounded-md border border-border-subtle">
      <table className="w-full text-sm"><thead className="bg-surface-raised text-left text-text-muted"><tr><th className="t-caption px-3 py-1.5 font-medium">행</th><th className="t-caption px-3 py-1.5 font-medium">모델 코드</th>
        <th className="t-caption px-3 py-1.5 font-medium">결과</th><th className="t-caption px-3 py-1.5 font-medium">사유</th></tr></thead>
        <tbody>{listed.map(({ r, s }) => <tr key={r.rowNo} className="border-t border-border-subtle"><td className="tabular px-3 py-1 text-text-muted">{r.rowNo}</td><td className="t-mono px-3 py-1">{r.raw.ModelNo}</td>
          <td className="px-3 py-1">{s.reason === '__pending' ? <StatusBadge tone="neutral">대기</StatusBadge> : <StatusBadge tone={APPLY_TONE[s.status]}>{APPLY_LABEL[s.status]}</StatusBadge>}</td>
          <td className="t-mono px-3 py-1 text-text-secondary">{s.reason && s.reason !== '__pending' ? s.reason : r.error ? r.error.code : ''}</td></tr>)}</tbody></table>
      <div className="t-caption flex items-center justify-between border-t border-border-subtle bg-surface-raised px-3 py-1.5 text-text-muted"><span>{partial ? '실패·충돌·건너뜀·제외 행만 표시' : '주요 행 표시'} · 전체는 리포트에서</span>
        <Button type="button" variant="link" size="sm"><Download className="size-3.5" aria-hidden />결과 리포트 CSV (Import imp-0412)</Button></div>
    </div>
  </div>;
}
