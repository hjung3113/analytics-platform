/**
 * PROTOTYPE (#1197 / #1108): pieces every variant shares — the variant switcher, the three state-axis badges, the write and
 * assessment drawers and links. Layouts are NOT shared: each variant owns its own (prototype UI.md anti-pattern).
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { PlatformLink, usePlatform } from '@ap/kernel';
import { DetailDrawer, SegmentedRadio } from '@ap/components';
import {
  Button, Callout, Combobox, FieldLabel, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge, Textarea, cn, isProductionEnv, type Tone,
} from '@ap/ui';
import {
  AXIS_LABEL, EVIDENCE_KIND_LABEL, MODELS, PROCESSING_LABEL, PUBLICATION_LABEL, SOFTWARE, TYPE_LABEL, VERIFICATION_LABEL, modelById, ownerLabel,
  type Axis, type Evidence, type Item, type ItemType, type Processing, type Publication, type Verification,
} from './fixture';
import { addItem, assess } from './store';
import { CATALOG_MANAGE_PERMISSION } from '../endpoints';

export type Variant = 'A' | 'B' | 'C';
const VARIANTS: Variant[] = ['A', 'B', 'C'];
export type VariantNames = Record<Variant, string>;

export function useVariant(): Variant {
  const { pageParam } = usePlatform();
  const raw = pageParam('variant');
  return raw === 'B' || raw === 'C' ? raw : 'A';
}

/** Editors see write controls (prototype: the catalog-manage permission stands in for a knowledge-edit permission). */
export function useCanEdit(): boolean {
  return usePlatform().can(CATALOG_MANAGE_PERMISSION);
}

/** Floating bottom-centre pill (prototype UI.md §4): ←/→ cycle when no input is focused; hidden in a production build. */
export function VariantSwitcher({ names }: { names: VariantNames }) {
  const variant = useVariant();
  const { setPage } = usePlatform();
  const hidden = isProductionEnv(import.meta as unknown as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } });
  const go = (step: number) => setPage({ variant: VARIANTS[(VARIANTS.indexOf(variant) + step + 3) % 3]!, drawer: null }, { replace: true });
  useEffect(() => {
    if (hidden) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="tree"], [role="listbox"], [role="tablist"], [role="dialog"]')) return;
      event.preventDefault();
      go(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (hidden) return null;
  // Portaled out of the page: the table fit measures following siblings, and a fixed pill there would shrink every table.
  return createPortal(<div role="group" aria-label="프로토타입 안 전환" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-text-primary px-1.5 py-1 text-text-inverse shadow-lg">
    <button type="button" aria-label="이전 안" onClick={() => go(-1)} className="grid size-7 place-items-center rounded-full hover:bg-text-secondary"><ChevronLeft className="size-4" aria-hidden /></button>
    <span className="min-w-44 px-2 text-center text-xs font-semibold" aria-live="polite">{variant} · {names[variant]}</span>
    <button type="button" aria-label="다음 안" onClick={() => go(1)} className="grid size-7 place-items-center rounded-full hover:bg-text-secondary"><ChevronRight className="size-4" aria-hidden /></button>
  </div>, document.body);
}

const VERIFICATION_TONE: Record<Verification, Tone> = { not_checked: 'neutral', observed: 'info', verified: 'success', disputed: 'warning' };
const PROCESSING_TONE: Record<Processing, Tone> = { open: 'info', under_investigation: 'warning', resolved: 'success' };
const PUBLICATION_TONE: Record<Publication, Tone> = { draft: 'neutral', published: 'info', archived: 'neutral' };

/** Three separate axes, each with its own label prefix so meaning never rests on colour (§7.2: 게시 ≠ 검증). */
export function StateBadges({ item, axes = ['publication', 'verification', 'processing'] }: { item: Pick<Item, Axis>; axes?: Axis[] }) {
  return <span className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">
    {axes.map(axis => <StateBadge key={axis} axis={axis} value={item[axis]} />)}
  </span>;
}
export function StateBadge({ axis, value }: { axis: Axis; value: string }) {
  const label = stateLabel(axis, value);
  const tone = axis === 'verification' ? VERIFICATION_TONE[value as Verification] : axis === 'processing' ? PROCESSING_TONE[value as Processing] : PUBLICATION_TONE[value as Publication];
  return <StatusBadge tone={tone ?? 'neutral'}><span className="font-normal opacity-80">{AXIS_LABEL[axis]}</span>&nbsp;{label}</StatusBadge>;
}
export function stateLabel(axis: Axis, value: string): string {
  return (axis === 'verification' ? VERIFICATION_LABEL : axis === 'processing' ? PROCESSING_LABEL : PUBLICATION_LABEL)[value as never] ?? value;
}
export function TypeBadge({ type }: { type: ItemType }) {
  return <span className="inline-flex h-5 items-center whitespace-nowrap rounded-sm border border-border-default px-1.5 text-xs text-text-secondary">{TYPE_LABEL[type]}</span>;
}
export function OwnerChip({ item }: { item: Pick<Item, 'ownerKind' | 'ownerId'> }) {
  return <span className="inline-flex h-5 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-sm bg-surface-sunken px-1.5 text-xs text-text-secondary">
    <span className="shrink-0 text-text-muted">소유 {item.ownerKind === 'model' ? 'Model' : 'SW'}</span><span className="t-mono truncate text-text-primary" title={ownerLabel(item)}>{ownerLabel(item)}</span>
  </span>;
}

export function useLinks() {
  const { linkTo } = usePlatform();
  const variant = useVariant();
  return useMemo(() => ({
    model: (modelId: string, page: Record<string, string> = {}) => linkTo('log-knowledge-model', { params: { modelId }, page: { variant, ...page } }),
    item: (itemId: string, page: Record<string, string> = {}) => linkTo('log-knowledge-item', { params: { itemId }, page: { variant, ...page } }),
    models: (page: Record<string, string | string[]> = {}) => linkTo('log-knowledge-models', { page: { variant, ...page } }),
    items: (page: Record<string, string | string[]> = {}) => linkTo('log-knowledge-items', { page: { variant, ...page } }),
  }), [linkTo, variant]);
}

export function ItemLink({ id, children }: { id: string; children?: ReactNode }) {
  const links = useLinks();
  return <PlatformLink className="t-mono text-accent-primary hover:underline" href={links.item(id)}>{children ?? id}</PlatformLink>;
}

/** Section frame shared by the stacked and hub layouts. */
export function Section({ title, count, actions, children, className }: { title: string; count?: number; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section aria-label={title} className={cn('rounded-md border border-border-subtle bg-surface-card', className)}>
    <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border-subtle px-4 py-1.5">
      <h2 className="text-sm font-semibold text-text-primary">{title}{count !== undefined && <span className="tabular ml-1.5 font-normal text-text-muted">{count}</span>}</h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
    <div className="p-4">{children}</div>
  </section>;
}

export function EmptyNote({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="flex flex-col items-start gap-2 rounded-md bg-surface-sunken p-4 text-sm text-text-secondary">
    <p>{text}</p>{action}
  </div>;
}

/* ───────── Write drawer (새 기술 Item / 관련 Item으로 신규 작성) ───────── */

const OWNER_MODEL_OPTIONS = MODELS.map(m => ({ value: m.id, label: `${m.code} · ${m.name}` }));
const OWNER_SW_OPTIONS = SOFTWARE.map(s => ({ value: s.id, label: `${modelById.get(s.modelId)?.code ?? '?'} / ${s.version}` }));
type EvidenceDraft = { key: number; kind: Evidence['kind']; location: string };

function Field({ id, label, required, hint, error, children }: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return <div className="grid gap-1.5">
    <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
    {children}
    {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    {error && <p role="alert" className="text-xs text-text-danger-label">{error}</p>}
  </div>;
}

/** `drawer=new` (optionally with an owner preset) or `drawer=derive&from=<item>`: one form. Derive copies title + analysis only, re-picks the owner, empties evidence and resets every state. */
export function ItemWriteDrawer({ source, presetOwner, onClose }: { source?: Item; presetOwner?: { kind: 'model' | 'software'; id: string }; onClose: () => void }) {
  const { toast, navigate } = usePlatform();
  const links = useLinks();
  const uid = useId();
  const derive = source !== undefined;
  const [ownerKind, setOwnerKind] = useState<'model' | 'software'>(presetOwner?.kind ?? source?.ownerKind ?? 'software');
  const [ownerId, setOwnerId] = useState<string>(presetOwner?.id ?? '');
  const [type, setType] = useState<ItemType>(source?.type ?? 'check');
  const [title, setTitle] = useState(source ? `${source.title} — ` : '');
  const [observed, setObserved] = useState('');
  const [expected, setExpected] = useState('');
  const [analysis, setAnalysis] = useState(source?.body.analysis ?? '');
  const [improvement, setImprovement] = useState('');
  const [evidence, setEvidence] = useState<EvidenceDraft[]>(derive ? [] : [{ key: 1, kind: 'log', location: '' }]);
  const [tried, setTried] = useState(false);
  const errors = { owner: ownerId ? undefined : '소유 대상을 하나 고르세요', title: title.trim() ? undefined : '제목을 입력하세요', observed: observed.trim() ? undefined : '관찰 사실을 입력하세요' };
  const sameOwner = derive && ownerId === source.ownerId;
  const save = () => {
    setTried(true);
    if (errors.owner || errors.title || errors.observed || sameOwner) return;
    const now = new Date().toISOString().slice(0, 10);
    const id = addItem({
      title: title.trim(), ownerKind, ownerId, type, category: source?.category ?? '이벤트 순서', tags: [], author: '나', createdAt: now, updatedAt: now,
      publication: 'draft', verification: 'not_checked', processing: 'open', body: { observed, expected, analysis, improvement },
      evidence: evidence.filter(e => e.location.trim()).map((e, i) => ({ id: `e-new-${i}`, kind: e.kind, label: EVIDENCE_KIND_LABEL[e.kind], location: e.location, detail: '출처 확인 전', access: 'ok' })),
      revisions: [{ rev: 1, at: now, by: '나', note: derive ? `${source.id} r${source.revisions.length}에서 파생 작성` : '최초 작성' }],
      history: [], links: derive ? [{ kind: 'derived_from', itemId: source.id, rev: source.revisions.length }] : [],
    });
    toast(`${id} 초안을 만들었습니다 (프로토타입: 이 탭에만 저장)`);
    onClose();
    navigate(links.item(id));
  };
  const ownerOptions = ownerKind === 'model' ? OWNER_MODEL_OPTIONS : OWNER_SW_OPTIONS;
  const form = <div className="grid gap-4">
    {derive && <Callout tone="blue" title={`${source.id} r${source.revisions.length}에서 파생 (derived_from)`}>
      제목과 분석 의견만 참고 초안으로 가져왔습니다. 소유 대상은 다시 고르고, 근거는 비어 있으며, 게시·검증·처리 상태는 처음 상태(초안 · 미확인 · 열림)로 시작합니다.
    </Callout>}
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-text-primary">소유 대상 <span className="text-text-danger">*</span></legend>
      <SegmentedRadio label="소유 대상 종류" value={ownerKind} onChange={kind => { setOwnerKind(kind); setOwnerId(''); }}
        options={[{ value: 'model', label: 'Model' }, { value: 'software', label: 'SW 버전' }]} />
      <Combobox id={`${uid}-owner`} options={ownerOptions} value={ownerId || null} onChange={setOwnerId} placeholder={ownerKind === 'model' ? '모델 선택' : 'SW 버전 선택'}
        searchPlaceholder="코드·버전 검색" listboxLabel="소유 대상 목록" emptyText="결과가 없습니다" aria-invalid={tried && (!!errors.owner || sameOwner)} />
      <p className="text-xs text-text-muted">Item은 Model 하나 또는 SW 버전 하나에만 속합니다. 다른 대상의 같은 현상은 새 Item으로 만들고 관계로 잇습니다.</p>
      {tried && errors.owner && <p role="alert" className="text-xs text-text-danger-label">{errors.owner}</p>}
      {tried && sameOwner && <p role="alert" className="text-xs text-text-danger-label">원본과 다른 소유 대상을 고르세요. 같은 대상이면 원본을 수정합니다.</p>}
    </fieldset>
    <Field id={`${uid}-type`} label="유형" required>
      <Select value={type} onValueChange={v => setType(v as ItemType)}>
        <SelectTrigger id={`${uid}-type`} appearance="field"><SelectValue /></SelectTrigger>
        <SelectContent>{(Object.keys(TYPE_LABEL) as ItemType[]).map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    <Field id={`${uid}-title`} label="제목" required error={tried ? errors.title : undefined}><Input id={`${uid}-title`} value={title} onChange={e => setTitle(e.target.value)} /></Field>
    <Field id={`${uid}-obs`} label="관찰 사실" required hint="현상, 재현 조건, 관측 이벤트·시각·순서" error={tried ? errors.observed : undefined}><Textarea id={`${uid}-obs`} rows={3} value={observed} onChange={e => setObserved(e.target.value)} /></Field>
    <Field id={`${uid}-exp`} label="기대·기준" hint="스펙·룰, 기대 순서, 기준 버전 (명세 출처)"><Textarea id={`${uid}-exp`} rows={2} value={expected} onChange={e => setExpected(e.target.value)} /></Field>
    <Field id={`${uid}-ana`} label="분석 의견" hint="추정 원인·해석. 사실로 승격되지 않습니다"><Textarea id={`${uid}-ana`} rows={3} value={analysis} onChange={e => setAnalysis(e.target.value)} /></Field>
    <Field id={`${uid}-imp`} label="개선 방향" hint="조치 제안, 재확인 포인트"><Textarea id={`${uid}-imp`} rows={2} value={improvement} onChange={e => setImprovement(e.target.value)} /></Field>
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium text-text-primary">근거</legend>
      {evidence.length === 0 && <p className="text-xs text-text-muted">등록된 근거 없음{derive ? ' — 파생 Item은 근거 없이 시작합니다' : ''}</p>}
      {evidence.map((row, i) => <div key={row.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-center gap-2">
        <Select value={row.kind} onValueChange={v => setEvidence(list => list.map(e => (e.key === row.key ? { ...e, kind: v as Evidence['kind'] } : e)))}>
          <SelectTrigger appearance="field" aria-label={`근거 ${i + 1} 종류`}><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(EVIDENCE_KIND_LABEL) as Evidence['kind'][]).map(k => <SelectItem key={k} value={k}>{EVIDENCE_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
        </Select>
        <Input aria-label={`근거 ${i + 1} 위치`} placeholder="Source ID · 행 범위 · 문서 위치" value={row.location} onChange={e => setEvidence(list => list.map(x => (x.key === row.key ? { ...x, location: e.target.value } : x)))} />
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`근거 ${i + 1} 빼기`} onClick={() => setEvidence(list => list.filter(x => x.key !== row.key))}><X className="size-3.5" aria-hidden /></Button>
      </div>)}
      <Button type="button" size="sm" variant="secondary" className="justify-self-start" onClick={() => setEvidence(list => [...list, { key: Date.now(), kind: 'log', location: '' }])}><Plus className="size-3.5" aria-hidden />근거 추가</Button>
    </fieldset>
    <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
      <Button type="button" variant="secondary" onClick={onClose}>취소</Button>
      <Button type="button" onClick={save}>초안 저장</Button>
    </div>
  </div>;
  return <DetailDrawer title={derive ? '관련 Item으로 신규 작성' : '새 기술 Item'} subtitle={derive ? `원본 ${source.id} · ${ownerLabel(source)}` : '초안으로 저장됩니다'} onClose={onClose}
    tabs={[{ id: 'form', label: '작성', content: form }]} />;
}

/* ───────── Assessment drawer (판단 변경) ───────── */

const STATES: Record<Axis, string[]> = {
  verification: ['not_checked', 'observed', 'verified', 'disputed'],
  processing: ['open', 'under_investigation', 'resolved'],
  publication: ['published', 'archived'],
};

export function AssessDrawer({ item, onClose }: { item: Item; onClose: () => void }) {
  const { toast } = usePlatform();
  const uid = useId();
  const [axis, setAxis] = useState<Axis>('verification');
  const [to, setTo] = useState<string>('');
  const [reason, setReason] = useState('');
  const [evidenceId, setEvidenceId] = useState<string>('');
  const [tried, setTried] = useState(false);
  const current = item[axis];
  const errors = { to: to && to !== current ? undefined : '현재와 다른 상태를 고르세요', reason: reason.trim().length >= 5 ? undefined : '사유를 5자 이상 적으세요' };
  const save = () => {
    setTried(true);
    if (errors.to || errors.reason) return;
    assess(item.id, axis, to, reason.trim(), '나');
    toast(`${AXIS_LABEL[axis]} 상태를 ${stateLabel(axis, to)}(으)로 바꿨습니다. 이전 판단은 이력에 남습니다.`);
    onClose();
  };
  const form = <div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">현재 <StateBadges item={item} /></div>
    <Field id={`${uid}-axis`} label="바꿀 상태 축" required hint="세 축은 서로 독립입니다. 게시는 검증이 아닙니다.">
      <Select value={axis} onValueChange={v => { setAxis(v as Axis); setTo(''); }}>
        <SelectTrigger id={`${uid}-axis`} appearance="field"><SelectValue /></SelectTrigger>
        <SelectContent>{(Object.keys(STATES) as Axis[]).map(a => <SelectItem key={a} value={a}>{AXIS_LABEL[a]}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    <Field id={`${uid}-to`} label="새 상태" required error={tried ? errors.to : undefined}>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger id={`${uid}-to`} appearance="field" aria-invalid={tried && !!errors.to}><SelectValue placeholder="상태 선택" /></SelectTrigger>
        <SelectContent>{STATES[axis].map(s => <SelectItem key={s} value={s} disabled={s === current}>{stateLabel(axis, s)}{s === current ? ' (현재)' : ''}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    <Field id={`${uid}-reason`} label="변경 사유" required hint="이력에 그대로 남고 고칠 수 없습니다" error={tried ? errors.reason : undefined}>
      <Textarea id={`${uid}-reason`} rows={4} value={reason} onChange={e => setReason(e.target.value)} aria-invalid={tried && !!errors.reason} />
    </Field>
    <Field id={`${uid}-ev`} label="근거 연결" hint={item.evidence.length === 0 ? '등록된 근거 없음' : '선택'}>
      <Select value={evidenceId} onValueChange={setEvidenceId} disabled={item.evidence.length === 0}>
        <SelectTrigger id={`${uid}-ev`} appearance="field"><SelectValue placeholder="근거 선택" /></SelectTrigger>
        <SelectContent>{item.evidence.map(e => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
      <Button type="button" variant="secondary" onClick={onClose}>취소</Button>
      <Button type="button" onClick={save}>판단 변경 기록</Button>
    </div>
  </div>;
  return <DetailDrawer title="판단 변경" subtitle={`${item.id} · ${item.title}`} onClose={onClose} tabs={[{ id: 'form', label: '판단 변경', content: form }]} />;
}
