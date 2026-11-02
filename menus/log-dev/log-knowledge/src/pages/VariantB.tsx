/** Variant B — 모델 중심 표: Model is the pivot; 제조사·공정 are filters in one row; SW 버전 live in the model's drawer (MUI/AG master-detail idea). */
import { useMemo, useState } from 'react';
import { PanelRight, Plus, RotateCcw, Settings2, Upload } from 'lucide-react';
import { DetailDrawer, ManagementLayout, PlatformDataTable, PlatformPage, RowAction, type PlatformColumn } from '@ap/components';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@ap/ui';
import type { VariantProps } from './CatalogPrototype';
import { counts, DEMO_MODEL_ID, saveModel, setStatus, specLabel, type EntityKind, type Model, type ModelDraft } from './fixture';
import { ACTIVE_ONLY, DeactivateDialog, InactiveNotice, ModelForm, NONE, ProcessChips, STATUS_FILTER, StatusCell, includesText, localPage, useLocalTableState, type DeactivateTarget } from './shared';

type Row = Model & { maker: string; sw: number; latest: string };

export function VariantB({ catalog, setCatalog, forced }: VariantProps) {
  const [q, setQ] = useState('');
  const [table] = useLocalTableState(forced === 'inactive' ? [{ id: 'status', op: 'in', value: ['inactive'] }] : ACTIVE_ONLY);
  const [focus, setFocus] = useState<string | null>(forced === 'edit' || forced === 'error' ? DEMO_MODEL_ID : forced === 'inactive' ? 'md-58' : null);
  const [creating, setCreating] = useState(false);
  const [drawerTab, setDrawerTab] = useState(forced === 'edit' || forced === 'error' ? 'info' : 'sw');
  const [manage, setManage] = useState(false);
  const [target, setTarget] = useState<DeactivateTarget>(forced === 'deactivate' ? { kind: 'model', id: DEMO_MODEL_ID } : null);
  const c = useMemo(() => counts(catalog), [catalog]);

  const rows: Row[] = useMemo(() => catalog.models
    .filter(m => includesText(q, m.code, m.name))
    .map(m => {
      const vs = catalog.versions.filter(v => v.modelId === m.id);
      return { ...m, maker: catalog.makers.find(x => x.id === m.makerId)?.name ?? '', sw: vs.length, latest: vs.at(-1)?.version ?? '' };
    }), [catalog, q]);

  const columns = useMemo<PlatformColumn<Row>[]>(() => [
    { id: 'code', header: '모델 코드', size: 112, cell: r => <span className="t-mono">{r.code}</span> },
    { id: 'status', header: '상태', size: 100, cell: r => <StatusCell status={r.status} />, filter: STATUS_FILTER, filterPinned: 3 },
    { id: 'name', header: '모델명', size: 140 },
    { id: 'maker', header: '제조사', size: 124, filter: { kind: 'enum', options: catalog.makers.map(m => ({ value: m.name, label: m.name })) }, filterPinned: 1 },
    { id: 'processIds', header: '공정', size: 230, sortable: false, exportable: false, cell: r => <ProcessChips catalog={catalog} ids={r.processIds} />,
      filter: { kind: 'enum', options: [{ value: NONE, label: '미분류' }, ...catalog.processes.map(p => ({ value: p.id, label: p.code }))] }, filterPinned: 2 },
    { id: 'sw', header: 'SW 버전', size: 130, cell: r => r.sw === 0 ? <span className="text-text-muted">없음</span> : <span><span className="t-mono">{r.latest}</span><span className="t-caption ml-1.5 text-text-muted">{r.sw > 1 ? `외 ${r.sw - 1}` : ''}</span></span> },
    { id: 'updatedAt', header: '수정일', size: 112, cell: r => <span className="tabular whitespace-nowrap text-text-secondary">{r.updatedAt}</span> },
  ], [catalog]);

  const reactivate = (kind: EntityKind, id: string) => setCatalog(x => setStatus(x, kind, id, 'active'));
  const model = focus ? catalog.models.find(m => m.id === focus) : null;
  const close = () => { setFocus(null); setCreating(false); };
  const drawer = (model || creating) && (() => {
    const draft: ModelDraft = model ? { id: model.id, makerId: model.makerId, code: forced === 'error' ? 'AX-200' : model.code, name: model.name, processIds: model.processIds }
      : { id: null, makerId: '', code: '', name: '', processIds: [] };
    const notice = model?.status === 'inactive' ? <InactiveNotice kind="model" onReactivate={() => reactivate('model', model.id)} /> : null;
    const form = <div className="flex h-full flex-col gap-3">{notice}<ModelForm key={model?.id ?? 'new'} catalog={catalog} initial={draft}
      initialErrors={forced === 'error' ? { code: '같은 코드가 이미 있습니다', conflict: true } : undefined}
      onSave={d => { const r = saveModel(catalog, d); setCatalog(() => r.catalog); setCreating(false); setFocus(r.id); setDrawerTab('sw'); }} onCancel={close}
      onDeactivate={model && model.status === 'active' ? () => setTarget({ kind: 'model', id: model.id }) : undefined} /></div>;
    const versions = model ? catalog.versions.filter(v => v.modelId === model.id) : [];
    const sw = <div className="grid gap-3">
      {notice}
      <div className="flex items-center gap-2"><Input aria-label="새 SW 버전" placeholder="예: v3.2.1" className="h-8 flex-1" /><Button size="sm" variant="secondary"><Plus className="size-3.5" aria-hidden />SW 버전 등록</Button></div>
      {versions.length === 0 ? <p className="rounded-md border border-dashed border-border-default p-4 text-center text-sm text-text-secondary">SW 버전 0개 — 첫 버전을 등록하세요.</p>
        : <table className="w-full text-sm"><thead><tr className="t-caption text-left text-text-muted"><th className="py-1 font-normal">버전</th><th className="font-normal">명세</th><th className="font-normal">상태</th><th /></tr></thead>
          <tbody className="divide-y divide-border-subtle">{versions.map(v => <tr key={v.id} className={v.status === 'inactive' ? 'text-text-muted' : ''}>
            <td className="t-mono py-1.5">{v.version}</td><td className="text-text-secondary">{specLabel[v.specState]}</td><td><StatusCell status={v.status} /></td>
            <td className="text-right">{v.status === 'inactive'
              ? <Button size="sm" variant="ghost" onClick={() => reactivate('version', v.id)}>다시 활성화</Button>
              : <Button size="sm" variant="ghost" onClick={() => setTarget({ kind: 'version', id: v.id })}>비활성화</Button>}</td>
          </tr>)}</tbody></table>}
    </div>;
    return <DetailDrawer key={model?.id ?? 'new'} title={model ? <span className="t-mono">{model.code}</span> : '모델 등록'} subtitle={model ? `${model.name} · ${catalog.makers.find(x => x.id === model.makerId)?.name}` : '필수 항목만 먼저 채웁니다'}
      onClose={close} tab={model ? drawerTab : 'info'} onTabChange={setDrawerTab} context="목록 필터와 선택은 그대로입니다."
      tabs={model ? [{ id: 'sw', label: `SW 버전 ${versions.length}`, content: sw }, { id: 'info', label: '모델 정보·공정', content: form }] : [{ id: 'info', label: '모델 정보·공정', content: form }]} />;
  })();

  const search = <Input aria-label="모델 검색" placeholder="모델 코드·이름 검색" className="h-8 w-56" value={q} onChange={e => setQ(e.target.value)} />;

  return <PlatformPage description="모델 하나에 제조사 1개, 공정 여러 개, SW 버전 여러 개가 붙습니다. 지우지 않고 비활성화합니다. 합성 데이터."
    primaryAction={<Button size="sm" onClick={() => { setFocus(null); setCreating(true); }}><Plus className="size-3.5" aria-hidden />모델 등록</Button>}
    secondaryActions={<Button size="sm" variant="secondary"><Upload className="size-3.5" aria-hidden />가져오기(CSV/XLSX)</Button>}>
    <div className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
      <span>모델의 위쪽 분류</span><span className="tabular">제조사 {catalog.makers.length}개 · 공정 {catalog.processes.length}개</span>
      <Button size="sm" variant="ghost" onClick={() => setManage(true)}><Settings2 className="size-3.5" aria-hidden />제조사·공정 관리</Button>
    </div>
    <ManagementLayout drawer={drawer} table={<PlatformDataTable<Row>
      title="모델 목록" ariaLabel="모델 목록" subtitle={`SW 버전 ${catalog.versions.length}개`}
      columns={columns} getRowId={r => r.id} urlState={table} filterKey={`${q}|${JSON.stringify(rows.map(r => r.id + r.status + r.code + r.processIds.join()))}`}
      preferenceKey="log-knowledge-proto-b" loadPage={localPage(rows, ['processIds'])} search={search} pageSize={25} activeRowId={focus}
      rowAction={(r, { compact }) => r.status === 'inactive'
        ? <RowAction compact={compact} icon={RotateCcw} label={`${r.code} 다시 활성화`} text="다시 활성화" onClick={() => reactivate('model', r.id)} />
        : <RowAction compact={compact} icon={PanelRight} label={`${r.code} 열기`} text="열기" onClick={() => { setCreating(false); setFocus(r.id); setDrawerTab('sw'); }} />} />} />
    <Dialog open={manage} onOpenChange={setManage}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>제조사·공정 관리</DialogTitle><DialogDescription>모델의 위쪽 분류입니다. 지우지 않고 비활성화합니다.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {(['maker', 'process'] as const).map(kind => <section key={kind} className="min-w-0">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{kind === 'maker' ? '제조사' : '공정'}</h3><Button size="sm" variant="secondary"><Plus className="size-3.5" aria-hidden />등록</Button></div>
            <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto rounded-md border border-border-subtle">
              {(kind === 'maker' ? catalog.makers : catalog.processes).map(x => <li key={x.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="t-mono w-16">{x.code}</span><span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="tabular t-caption text-text-muted">모델 {(kind === 'maker' ? c.modelsByMaker : c.modelsByProcess).get(x.id) ?? 0}</span>
                <StatusCell status={x.status} />
                {x.status === 'inactive' ? <Button size="sm" variant="ghost" onClick={() => reactivate(kind, x.id)}>다시 활성화</Button>
                  : <Button size="sm" variant="ghost" onClick={() => setTarget({ kind, id: x.id })}>비활성화</Button>}
              </li>)}
            </ul>
          </section>)}
        </div>
      </DialogContent>
    </Dialog>
    <DeactivateDialog catalog={catalog} target={target} onCancel={() => setTarget(null)} onConfirm={() => { if (target) setCatalog(x => setStatus(x, target.kind, target.id, 'inactive')); setTarget(null); }} />
  </PlatformPage>;
}
