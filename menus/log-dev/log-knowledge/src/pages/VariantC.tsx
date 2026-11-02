/** Variant C — 3열 드릴: 제조사 → 모델 → SW 버전 side by side with a detail pane (SAP Fiori FCL); 공정 is a separate mode (N:M is not a tree edge). */
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Plus, Upload } from 'lucide-react';
import { PlatformPage } from '@ap/components';
import { Button, Input, StatusBadge, ToggleGroup, ToggleGroupItem, cn } from '@ap/ui';
import type { VariantProps } from './CatalogPrototype';
import { counts, DEMO_MODEL_ID, ko, matchesStatus, nameOf, saveModel, setStatus, specLabel, type EntityKind, type ModelDraft, type StatusFilter } from './fixture';
import { DeactivateDialog, InactiveNotice, ModelForm, ProcessChips, SimpleForm, StatusFilterSelect, UnclassifiedBadge, includesText, type DeactivateTarget } from './shared';

type Mode = 'maker' | 'process';
type Level = 'parent' | 'model' | 'version';
const UNCLASSIFIED = '__none';

export function VariantC({ catalog, setCatalog, forced }: VariantProps) {
  const editing = forced === 'edit' || forced === 'error';
  const [mode, setMode] = useState<Mode>('maker');
  const [status, setStatusFilter] = useState<StatusFilter>(forced === 'inactive' ? 'all' : 'active');
  const [parent, setParent] = useState<string>(forced === 'inactive' ? 'mk-H' : 'mk-A');
  const [modelId, setModelId] = useState<string | null>(editing ? DEMO_MODEL_ID : null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>(editing ? 'model' : 'parent');
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<DeactivateTarget>(forced === 'deactivate' ? { kind: 'maker', id: 'mk-A' } : null);
  const c = useMemo(() => counts(catalog), [catalog]);

  const parents = mode === 'maker'
    ? catalog.makers.filter(m => matchesStatus(m.status, status)).map(m => ({ id: m.id, code: m.code, name: m.name, status: m.status, count: c.modelsByMaker.get(m.id) ?? 0 }))
    : [...catalog.processes.filter(p => matchesStatus(p.status, status)).map(p => ({ id: p.id, code: p.code, name: p.name, status: p.status, count: c.modelsByProcess.get(p.id) ?? 0 })),
      { id: UNCLASSIFIED, code: '—', name: '미분류', status: 'active' as const, count: catalog.models.filter(m => m.processIds.length === 0).length }];
  const models = catalog.models.filter(m => matchesStatus(m.status, status) && includesText(q, m.code, m.name)
    && (mode === 'maker' ? m.makerId === parent : parent === UNCLASSIFIED ? m.processIds.length === 0 : m.processIds.includes(parent)));
  const versions = modelId ? catalog.versions.filter(v => v.modelId === modelId && matchesStatus(v.status, status)) : [];

  const pickParent = (id: string) => { setParent(id); setModelId(null); setVersionId(null); setLevel('parent'); setCreating(false); };
  const pickModel = (id: string) => { setModelId(id); setVersionId(null); setLevel('model'); setCreating(false); };
  const reactivate = (kind: EntityKind, id: string) => setCatalog(x => setStatus(x, kind, id, 'active'));
  const parentKind: EntityKind = mode === 'maker' ? 'maker' : 'process';

  const pane = (() => {
    if (creating) return <Pane title="모델 등록" subtitle={mode === 'maker' ? `${nameOf(catalog, 'maker', parent)} 아래에 등록` : '제조사를 고르세요'}>
      <ModelForm catalog={catalog} initial={{ id: null, makerId: mode === 'maker' ? parent : '', code: '', name: '', processIds: mode === 'process' && parent !== UNCLASSIFIED ? [parent] : [] }}
        onSave={d => { const r = saveModel(catalog, d); setCatalog(() => r.catalog); pickModel(r.id); }} onCancel={() => setCreating(false)} />
    </Pane>;
    if (level === 'model' && modelId) {
      const m = catalog.models.find(x => x.id === modelId)!;
      const draft: ModelDraft = { id: m.id, makerId: m.makerId, code: forced === 'error' ? 'AX-200' : m.code, name: m.name, processIds: m.processIds };
      return <Pane title={<><span className="t-mono">{m.code}</span> 수정</>} subtitle={`${m.name} · SW 버전 ${c.versionsByModel.get(m.id) ?? 0}개`}>
        {m.status === 'inactive' && <InactiveNotice kind="model" onReactivate={() => reactivate('model', m.id)} />}
        <ModelForm key={m.id} catalog={catalog} initial={draft} initialErrors={forced === 'error' ? { code: '같은 코드가 이미 있습니다', conflict: true } : undefined}
          onSave={d => { const r = saveModel(catalog, d); setCatalog(() => r.catalog); }} onCancel={() => setLevel('parent')}
          onDeactivate={m.status === 'active' ? () => setTarget({ kind: 'model', id: m.id }) : undefined} />
      </Pane>;
    }
    if (level === 'version' && versionId) {
      const v = catalog.versions.find(x => x.id === versionId)!;
      return <Pane title={<span className="t-mono">{v.version}</span>} subtitle={`모델 ${nameOf(catalog, 'model', v.modelId)} · ${specLabel[v.specState]}`}>
        {v.status === 'inactive' ? <InactiveNotice kind="version" onReactivate={() => reactivate('version', v.id)} />
          : <p className="text-sm text-text-secondary">명세와 기술 항목은 SW 프로파일에서 고칩니다.</p>}
        <div className="mt-auto flex gap-2 border-t border-border-subtle pt-3">{v.status === 'active' && <Button size="sm" variant="outline" onClick={() => setTarget({ kind: 'version', id: v.id })}>비활성화</Button>}</div>
      </Pane>;
    }
    if (parent === UNCLASSIFIED) return <Pane title="미분류 모델" subtitle="공정이 하나도 없는 모델입니다">
      <p className="text-sm text-text-secondary">모델을 골라 공정을 연결하세요.</p></Pane>;
    const p = mode === 'maker' ? catalog.makers.find(x => x.id === parent)! : catalog.processes.find(x => x.id === parent)!;
    return <Pane title={<>{ko[parentKind]} <span className="t-mono">{p.code}</span></>} subtitle={`${p.name} · ${mode === 'maker' ? '모델' : '연결 모델'} ${(mode === 'maker' ? c.modelsByMaker : c.modelsByProcess).get(p.id) ?? 0}개`}>
      {p.status === 'inactive' && <InactiveNotice kind={parentKind} onReactivate={() => reactivate(parentKind, p.id)} />}
      <SimpleForm key={p.id} kind={parentKind} code={p.code} name={p.name} onCancel={() => undefined} onDeactivate={p.status === 'active' ? () => setTarget({ kind: parentKind, id: p.id }) : undefined} />
    </Pane>;
  })();

  return <PlatformPage layout="fill" description="제조사 → 모델 → SW 버전을 차례로 고릅니다. 공정은 따로 봅니다. 지우지 않고 비활성화합니다. 합성 데이터."
    primaryAction={<Button size="sm" onClick={() => setCreating(true)}><Plus className="size-3.5" aria-hidden />모델 등록</Button>}
    secondaryActions={<Button size="sm" variant="secondary"><Upload className="size-3.5" aria-hidden />가져오기(CSV/XLSX)</Button>}>
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-14">
      <div className="flex items-center gap-3">
        <ToggleGroup type="single" value={mode} onValueChange={v => { if (v) { setMode(v as Mode); setParent(v === 'maker' ? 'mk-A' : 'pr-ETCH'); setModelId(null); setVersionId(null); setLevel('parent'); } }} aria-label="기준">
          <ToggleGroupItem value="maker" size="sm">제조사 → 모델 → SW</ToggleGroupItem>
          <ToggleGroupItem value="process" size="sm">공정 → 모델</ToggleGroupItem>
        </ToggleGroup>
        <StatusFilterSelect value={status} onChange={setStatusFilter} />
        <nav aria-label="선택 경로" className="flex min-w-0 items-center gap-1 text-sm text-text-secondary">
          <span>{parent === UNCLASSIFIED ? '미분류' : nameOf(catalog, parentKind, parent)}</span>
          {modelId && <><ChevronRight className="size-3.5" aria-hidden /><span className="t-mono">{nameOf(catalog, 'model', modelId)}</span></>}
          {versionId && <><ChevronRight className="size-3.5" aria-hidden /><span className="t-mono">{catalog.versions.find(v => v.id === versionId)?.version}</span></>}
        </nav>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <Column title={ko[parentKind]} count={parents.length} className="w-52" action={<Button size="icon-xs" variant="ghost" aria-label={`${ko[parentKind]} 등록`}><Plus className="size-3.5" aria-hidden /></Button>}>
          {parents.map(p => <Item key={p.id} selected={parent === p.id} active={level === 'parent' && parent === p.id} onSelect={() => pickParent(p.id)}
            primary={p.id === UNCLASSIFIED ? <UnclassifiedBadge /> : <span className="t-mono">{p.code}</span>} secondary={p.id === UNCLASSIFIED ? '공정 없음' : p.name} count={p.count} inactive={p.status === 'inactive'} />)}
        </Column>
        <Column title={mode === 'maker' ? '모델' : '연결 모델'} count={models.length} className="min-w-0 flex-1"
          tools={<Input aria-label="모델 검색" placeholder="모델 검색" className="h-7" value={q} onChange={e => setQ(e.target.value)} />}
          action={<Button size="icon-xs" variant="ghost" aria-label="모델 등록" onClick={() => setCreating(true)}><Plus className="size-3.5" aria-hidden /></Button>}>
          {models.length === 0 ? <Empty>{status === 'active' ? '활성 모델이 없습니다' : '모델이 없습니다'}</Empty>
            : models.map(m => <Item key={m.id} selected={modelId === m.id} active={level === 'model' && modelId === m.id} onSelect={() => pickModel(m.id)}
              primary={<span className="t-mono">{m.code}</span>} secondary={mode === 'maker' ? <ProcessChips catalog={catalog} ids={m.processIds} max={2} /> : nameOf(catalog, 'maker', m.makerId)}
              count={c.versionsByModel.get(m.id) ?? 0} inactive={m.status === 'inactive'} />)}
        </Column>
        <Column title="SW 버전" count={modelId ? versions.length : null} className="w-52"
          action={modelId ? <Button size="icon-xs" variant="ghost" aria-label="SW 버전 등록"><Plus className="size-3.5" aria-hidden /></Button> : undefined}>
          {!modelId ? <Empty>모델을 고르세요</Empty> : versions.length === 0 ? <Empty>SW 버전 0개</Empty>
            : versions.map(v => <Item key={v.id} selected={versionId === v.id} active={level === 'version' && versionId === v.id} onSelect={() => { setVersionId(v.id); setLevel('version'); setCreating(false); }}
              primary={<span className="t-mono">{v.version}</span>} secondary={specLabel[v.specState]} inactive={v.status === 'inactive'} />)}
        </Column>
        <section aria-label="상세" className="flex w-96 shrink-0 flex-col border-l border-border-subtle bg-surface-detail">{pane}</section>
      </div>
    </div>
    <DeactivateDialog catalog={catalog} target={target} onCancel={() => setTarget(null)} onConfirm={() => { if (target) setCatalog(x => setStatus(x, target.kind, target.id, 'inactive')); setTarget(null); }} />
  </PlatformPage>;
}

function Column({ title, count, className, tools, action, children }: { title: string; count: number | null; className?: string; tools?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className={cn('flex shrink-0 flex-col border-r border-border-subtle last:border-r-0', className)}>
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {count != null && <span className="tabular t-caption text-text-muted">{count}</span>}
      <span className="flex-1" />{action}
    </header>
    {tools && <div className="shrink-0 border-b border-border-subtle p-2">{tools}</div>}
    <ul role="listbox" aria-label={title} className="min-h-0 flex-1 overflow-y-auto py-1">{children}</ul>
  </section>;
}

function Item({ primary, secondary, count, inactive, selected, active, onSelect }: { primary: ReactNode; secondary: ReactNode; count?: number; inactive?: boolean; selected: boolean; active: boolean; onSelect: () => void }) {
  return <li role="option" aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={onSelect} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    className={cn('mx-1 flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm', selected ? 'bg-surface-row-selected' : 'hover:bg-surface-row-hover', active && 'ring-1 ring-inset ring-border-selected', inactive && 'text-text-muted')}>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center gap-1.5">{primary}{inactive && <StatusBadge tone="neutral">비활성</StatusBadge>}</span>
      <span className="t-caption min-w-0 truncate text-text-secondary">{secondary}</span>
    </span>
    {count != null && <span className="tabular t-caption shrink-0 text-text-muted">{count}</span>}
    {selected && <ChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden />}
  </li>;
}

function Empty({ children }: { children: ReactNode }) {
  return <li className="px-3 py-6 text-center text-sm text-text-muted">{children}</li>;
}

function Pane({ title, subtitle, children }: { title: ReactNode; subtitle: ReactNode; children: ReactNode }) {
  return <>
    <header className="shrink-0 border-b border-border-subtle px-4 py-2.5">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <p className="t-caption text-text-secondary">{subtitle}</p>
    </header>
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">{children}</div>
  </>;
}

