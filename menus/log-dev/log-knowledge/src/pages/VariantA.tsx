/** Variant A — 탭 + 오른쪽 서랍: one flat table per entity, create/edit in the docked DetailDrawer (PatternFly primary-detail). */
import { useMemo, useState } from 'react';
import { PanelRight, Plus, RotateCcw, Upload } from 'lucide-react';
import { DetailDrawer, ManagementLayout, PlatformDataTable, PlatformPage, RowAction, type PlatformColumn } from '@ap/components';
import { Button, Input, Tabs, TabsList, TabsTrigger } from '@ap/ui';
import type { VariantProps } from './CatalogPrototype';
import { counts, DEMO_MODEL_ID, ko, nameOf, saveModel, setStatus, specLabel, type EntityKind, type ModelDraft, type Status } from './fixture';
import { ACTIVE_ONLY, DeactivateDialog, InactiveNotice, ModelForm, ProcessChips, STATUS_FILTER, SimpleForm, StatusCell, includesText, localPage, useLocalTableState, type DeactivateTarget } from './shared';

type Row = { id: string; code: string; name: string; status: Status; updatedAt: string; maker?: string; processIds?: string[]; models?: number; sw?: number; spec?: string; model?: string };
type Drawer = { kind: EntityKind; id: string | null } | null;

export function VariantA({ catalog, setCatalog, forced }: VariantProps) {
  const [tab, setTab] = useState<EntityKind>(forced === 'inactive' || forced === 'deactivate' ? 'maker' : 'model');
  const [q, setQ] = useState('');
  const [table, setFilters] = useLocalTableState(forced === 'inactive' ? [] : ACTIVE_ONLY);
  const [drawer, setDrawer] = useState<Drawer>(forced === 'edit' || forced === 'error' ? { kind: 'model', id: DEMO_MODEL_ID } : forced === 'inactive' ? { kind: 'maker', id: 'mk-H' } : null);
  const [drawerTab, setDrawerTab] = useState('info');
  const [target, setTarget] = useState<DeactivateTarget>(forced === 'deactivate' ? { kind: 'maker', id: 'mk-A' } : null);
  const c = useMemo(() => counts(catalog), [catalog]);

  const rows: Row[] = useMemo(() => {
    const makerName = (id: string) => catalog.makers.find(m => m.id === id)?.name ?? '';
    const all: Row[] = tab === 'maker' ? catalog.makers.map(m => ({ ...m, models: c.modelsByMaker.get(m.id) ?? 0 }))
      : tab === 'process' ? catalog.processes.map(p => ({ ...p, models: c.modelsByProcess.get(p.id) ?? 0 }))
      : tab === 'model' ? catalog.models.map(m => ({ ...m, maker: makerName(m.makerId), sw: c.versionsByModel.get(m.id) ?? 0 }))
      : catalog.versions.map(v => { const m = catalog.models.find(x => x.id === v.modelId)!; return { id: v.id, code: v.version, name: v.version, status: v.status, updatedAt: v.updatedAt, model: m.code, maker: makerName(m.makerId), spec: specLabel[v.specState] }; });
    return all.filter(r => includesText(q, r.code, r.name, r.model ?? '', r.maker ?? ''));
  }, [catalog, c, tab, q]);

  const columns = useMemo<PlatformColumn<Row>[]>(() => {
    const code = (header: string): PlatformColumn<Row> => ({ id: 'code', header, size: tab === 'model' ? 112 : 88, cell: r => <span className="t-mono">{r.code}</span> });
    const state: PlatformColumn<Row> = { id: 'status', header: '상태', size: 100, cell: r => <StatusCell status={r.status} />, filter: STATUS_FILTER, filterPinned: 1 };
    const makerCol: PlatformColumn<Row> = { id: 'maker', header: '제조사', size: 124, filter: { kind: 'enum', options: catalog.makers.map(m => ({ value: m.name, label: m.name })) }, filterPinned: 2 };
    const updated: PlatformColumn<Row> = { id: 'updatedAt', header: '수정일', size: 112, cell: r => <span className="tabular whitespace-nowrap text-text-secondary">{r.updatedAt}</span> };
    const modelsLink = (header: string): PlatformColumn<Row> => ({ id: 'models', header, size: 104, align: 'right', cell: r => tab === 'maker'
      ? <button type="button" className="tabular text-accent-primary hover:underline" onClick={() => { setTab('model'); setFilters([{ id: 'maker', op: 'in', value: [r.name] }]); }}>{r.models}개</button>
      : <span className="tabular">{r.models}개</span> });
    if (tab === 'maker') return [code('코드'), state, { id: 'name', header: '제조사명', size: 140 }, modelsLink('모델 수'), updated];
    if (tab === 'process') return [code('코드'), state, { id: 'name', header: '공정명', size: 120 }, modelsLink('연결 모델 수'), updated];
    if (tab === 'model') return [code('모델 코드'), state, { id: 'name', header: '모델명', size: 150 }, makerCol,
      { id: 'processIds', header: '공정', size: 220, sortable: false, exportable: false, cell: r => <ProcessChips catalog={catalog} ids={r.processIds ?? []} /> },
      { id: 'sw', header: 'SW 수', size: 80, align: 'right', cell: r => <span className="tabular">{r.sw}</span> }, updated];
    return [code('SW 버전'), state, { id: 'model', header: '모델', size: 120, cell: r => <span className="t-mono">{r.model}</span> }, makerCol, { id: 'spec', header: '명세 상태', size: 120 }, updated];
  }, [tab, catalog, setFilters]);

  const reactivate = (kind: EntityKind, id: string) => setCatalog(x => setStatus(x, kind, id, 'active'));
  const open = (kind: EntityKind, id: string | null) => { setDrawer({ kind, id }); setDrawerTab('info'); };
  const model = drawer?.kind === 'model' && drawer.id ? catalog.models.find(m => m.id === drawer.id) : null;
  const initialDraft: ModelDraft = model ? { id: model.id, makerId: model.makerId, code: forced === 'error' ? 'AX-200' : model.code, name: model.name, processIds: model.processIds }
    : { id: null, makerId: '', code: '', name: '', processIds: [] };

  const drawerNode = drawer && (() => {
    const kind = drawer.kind;
    const close = () => setDrawer(null);
    const item = drawer.id == null ? null : kind === 'maker' ? catalog.makers.find(x => x.id === drawer.id) : kind === 'process' ? catalog.processes.find(x => x.id === drawer.id)
      : kind === 'model' ? catalog.models.find(x => x.id === drawer.id) : catalog.versions.find(x => x.id === drawer.id);
    const inactive = item?.status === 'inactive';
    const notice = inactive && drawer.id ? <InactiveNotice kind={kind} onReactivate={() => reactivate(kind, drawer.id!)} /> : null;
    const deactivate = item && !inactive ? () => setTarget({ kind, id: drawer.id! }) : undefined;
    const info = kind === 'model'
      ? <div className="flex h-full flex-col gap-3">{notice}<ModelForm key={drawer.id ?? 'new'} catalog={catalog} initial={initialDraft}
        initialErrors={forced === 'error' ? { code: '같은 코드가 이미 있습니다', conflict: true } : undefined}
        onSave={d => { const r = saveModel(catalog, d); setCatalog(() => r.catalog); setDrawer({ kind: 'model', id: r.id }); }} onCancel={close} onDeactivate={deactivate} /></div>
      : kind === 'version' ? <div className="grid gap-3">{notice}<p className="text-sm text-text-secondary">모델 {nameOf(catalog, 'version', drawer.id ?? '')} · 명세와 기술 항목은 SW 프로파일에서 고칩니다.</p></div>
      : <div className="flex h-full flex-col gap-3">{notice}<SimpleForm key={drawer.id} kind={kind} code={item && 'code' in item ? item.code : ''} name={item && 'name' in item ? item.name : ''} onCancel={close} onDeactivate={deactivate} /></div>;
    const related = kind === 'model' && drawer.id
      ? { id: 'sw', label: `SW 버전 ${c.versionsByModel.get(drawer.id) ?? 0}`, content: <ul className="divide-y divide-border-subtle">{catalog.versions.filter(v => v.modelId === drawer.id).map(v =>
        <li key={v.id} className="flex items-center gap-2 py-2"><span className="t-mono flex-1">{v.version}</span><span className="t-caption text-text-muted">{specLabel[v.specState]}</span><StatusCell status={v.status} /></li>)}</ul> }
      : kind === 'maker' && drawer.id ? { id: 'models', label: `모델 ${c.modelsByMaker.get(drawer.id) ?? 0}`, content: <ul className="divide-y divide-border-subtle">{catalog.models.filter(m => m.makerId === drawer.id).map(m =>
        <li key={m.id} className="flex items-center gap-2 py-2"><span className="t-mono flex-1">{m.code}</span><StatusCell status={m.status} /></li>)}</ul> }
      : null;
    const title = drawer.id == null ? `${ko[kind]} 등록` : `${ko[kind]} 수정`;
    return <DetailDrawer key={`${kind}-${drawer.id}`} title={<span>{title}{drawer.id && <span className="t-mono ml-2 text-text-secondary">{nameOf(catalog, kind, drawer.id)}</span>}</span>}
      subtitle={drawer.id ? `ID ${drawer.id} · 합성 데이터` : '필수 항목만 먼저 채웁니다'} onClose={close} tab={drawerTab} onTabChange={setDrawerTab}
      context="목록 필터와 선택은 그대로입니다."
      tabs={[{ id: 'info', label: '정보', content: info }, ...(related ? [related] : [])]} />;
  })();

  const search = <Input aria-label={`${ko[tab]} 검색`} placeholder="코드·이름 검색" className="h-8 w-56" value={q} onChange={e => setQ(e.target.value)} />;

  const tabCount = (k: EntityKind) => (k === 'maker' ? catalog.makers : k === 'process' ? catalog.processes : k === 'model' ? catalog.models : catalog.versions).length;
  return <PlatformPage description="제조사·공정·모델·SW 버전을 등록하고 고칩니다. 지우지 않고 비활성화합니다. 합성 데이터."
    primaryAction={<Button size="sm" onClick={() => open(tab, null)}><Plus className="size-3.5" aria-hidden />새로 만들기</Button>}
    secondaryActions={<Button size="sm" variant="secondary"><Upload className="size-3.5" aria-hidden />가져오기(CSV/XLSX)</Button>}>
    <Tabs value={tab} onValueChange={v => { setTab(v as EntityKind); setQ(''); setFilters(ACTIVE_ONLY); setDrawer(null); }} className="mb-3">
      <TabsList>{(['maker', 'process', 'model', 'version'] as const).map(k => <TabsTrigger key={k} value={k}>{ko[k]} <span className="tabular ml-1 text-text-muted">{tabCount(k)}</span></TabsTrigger>)}</TabsList>
    </Tabs>
    <ManagementLayout drawer={drawerNode} table={<PlatformDataTable<Row>
      key={tab} title={`${ko[tab]} 목록`} ariaLabel={`${ko[tab]} 목록`} columns={columns} getRowId={r => r.id}
      urlState={table} filterKey={`${tab}|${q}|${JSON.stringify(rows.map(r => r.id + r.status + r.code))}`} preferenceKey={`log-knowledge-proto-a-${tab}`}
      loadPage={localPage(rows)} search={search} pageSize={25} activeRowId={drawer?.id ?? null}
      rowAction={(r, { compact }) => r.status === 'inactive'
        ? <RowAction compact={compact} icon={RotateCcw} label={`${r.code} 다시 활성화`} text="다시 활성화" onClick={() => reactivate(tab, r.id)} />
        : <RowAction compact={compact} icon={PanelRight} label={`${r.code} 편집`} text="편집" onClick={() => open(tab, r.id)} />} />} />
    <DeactivateDialog catalog={catalog} target={target} onCancel={() => setTarget(null)} onConfirm={() => { if (target) setCatalog(x => setStatus(x, target.kind, target.id, 'inactive')); setTarget(null); }} />
  </PlatformPage>;
}
