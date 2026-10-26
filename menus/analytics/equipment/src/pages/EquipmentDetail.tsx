import { AlertTriangle } from 'lucide-react';
import { type PageProps, PlatformLink, useEntityAudit, useEntityQuery, useI18n, usePlatform } from '@ap/kernel';
import { AuditTimeline, DataTrustIndicator, Field, PlatformPage, QueryView, ReturnLink, StateMessage } from '@ap/components';
import { Button, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { EQUIPMENT_ENTITY_TYPE, type Equipment } from '../endpoints';
import { fields, statusText, statusTone, validity } from './data';

// EV host module menu (apps/platform-web mounts it); its page key `equipment` selects the equipment.
const EV_TOP_VIEW_MENU_ID = 'eqv:topview';

export function EquipmentStatus({ equipment }: { equipment: Equipment }) {
  const { lang } = useI18n();
  return <StatusBadge tone={statusTone[equipment.status]} dot>{statusText[equipment.status][lang]}</StatusBadge>;
}

export function EquipmentPanel({ id, kind }: { id: string; kind: 'attributes' | 'validity' | 'audit' | 'analysis' }) {
  const { global, scope, linkTo, resolveLink, registry } = usePlatform();
  const { lang } = useI18n();
  const ko = lang === 'ko';
  // resolveLink throws for an unregistered menu, so look before resolving. No permission ⇒ no link.
  const topViewLink = registry.menus.some(m => m.id === EV_TOP_VIEW_MENU_ID) ? resolveLink(EV_TOP_VIEW_MENU_ID, { page: { equipment: id } }) : null;
  const topView = topViewLink?.allowed ? topViewLink : null;
  const query = useEntityQuery<Equipment>({ type: EQUIPMENT_ENTITY_TYPE, id, scopeId: global.scopeId }, kind, kind !== 'audit' && scope.status === 'valid');
  // #50: the audit tab reads the destination's changes from the port, not the entity payload. Session identity
  // (ADR-0085): the ref carries the scope, so a scope change reads again, a period change does not. Older pages are
  // appended by the timeline's own control; the first page's data below is not used.
  const audit = useEntityAudit({ type: EQUIPMENT_ENTITY_TYPE, id, scopeId: global.scopeId }, kind === 'audit' && scope.status === 'valid');
  if (kind === 'audit') return <QueryView widgetName={ko ? '변경 이력' : 'Change history'} query={audit.query}>{() => <div className="space-y-4">
    <p className="t-caption text-text-muted">{ko ? '합성 감사 이벤트 · 실제 변경 기록이 아닙니다.' : 'Synthetic audit events · not real change records.'}</p>
    <AuditTimeline {...audit.timeline} />
  </div>}</QueryView>;
  return <QueryView widgetName={ko ? '설비 상세' : 'Equipment details'} query={query}>{(e, response) => e && <div className="space-y-4">
    <DataTrustIndicator trust={response.trust} assessments={response.assessments} />
    {kind === 'attributes' && <>
      <dl>{fields.map(f => <Field key={f.key} label={f[lang]} mono={f.key === 'equipmentId'}>{f.key === 'status' ? <EquipmentStatus equipment={e} /> : e[f.key] ?? '—'}</Field>)}</dl>
      <p className="t-caption text-text-muted">{ko ? 'StGroup·분임조: 현재 외부 공급값. 그 외 필드는 편집을 제공하지 않습니다.' : 'StGroup and team: current external values. Other fields are not editable.'}</p>
    </>}
    {kind === 'validity' && <>
      <p className="t-caption text-text-muted">{ko ? '합성 속성 버전입니다. 시작 시각부터 종료 시각 전까지이며, 과거 소속은 추정하지 않습니다.' : 'Synthetic attribute versions. Each interval runs from its start up to, but not including, its end. Past membership is not inferred.'}</p>
      <ol className="space-y-3 border-l-2 border-border-strong pl-4">{validity(e).map((v, i) => <li key={v.from} className="rounded-md border border-border-subtle bg-surface-card p-3">
        <h3 className="t-card-title">{ko ? '속성 버전' : 'Attribute version'} {i + 1}</h3>
        <p className="t-mono mt-1 text-text-secondary">{v.from} → {v.to ?? (ko ? '현재 (종료 없음)' : 'Current (open end)')}</p>
        <p className="mt-2 text-sm">{ko ? '챔버 유형' : 'Chamber type'}: {v.chamberType}</p>
      </li>)}</ol>
      {e.validTo && <p className="text-sm">{ko ? '유효 종료된 ID입니다. 레코드와 이력은 보존됩니다.' : 'This ID is retired. The record and history are retained.'}</p>}
    </>}
    {kind === 'analysis' && <>
      <p className="text-sm">{ko ? '사이클타임 링크를 누르면 설비 선택이 이 설비 한 대로 바뀝니다. 상세를 여는 것만으로는 바뀌지 않습니다.' : 'The cycle time link changes the equipment selection to this one equipment. Opening details alone does not change it.'}</p>
      <Button asChild size="sm"><PlatformLink href={linkTo('cycle-time', { global: { selection: [id] } })}>{ko ? '이 설비로 사이클타임 상세' : 'Cycle time for this equipment'}</PlatformLink></Button>
      {topView && <Button asChild size="sm" variant="secondary"><PlatformLink href={topView.href}>{ko ? '이 설비 Top View' : 'Top View for this equipment'}</PlatformLink></Button>}
    </>}
  </div>}</QueryView>;
}

export default function EquipmentDetail({ params }: PageProps) {
  const id = params.equipmentId;
  const { lang } = useI18n();
  const { global, scope, pageParam, setPage } = usePlatform();
  const ko = lang === 'ko';
  const requestedTab = pageParam('tab') ?? 'attributes';
  const tabs = [{ id: 'attributes', label: ko ? '속성' : 'Attributes' }, { id: 'validity', label: ko ? '유효구간 이력' : 'Validity history' }, { id: 'audit', label: ko ? '변경 이력' : 'Change history' }, { id: 'analysis', label: ko ? '관련 분석' : 'Related analysis' }] as const;
  const validTab = tabs.some(t => t.id === requestedTab);
  const header = useEntityQuery<Equipment>({ type: EQUIPMENT_ENTITY_TYPE, id, scopeId: global.scopeId }, 'header', scope.status === 'valid');
  return <PlatformPage title={<span className="t-mono">{id}</span>}
    description={ko ? '이 설비는 위에 전달된 설비 선택과 별개입니다. Scope와 설비 접근 권한은 다시 확인합니다.' : 'This equipment is separate from the equipment selection above. Scope and equipment access are checked again.'}
    secondaryActions={<ReturnLink />}>
    <QueryView widgetName={lang === 'ko' ? '설비 요약' : 'Equipment summary'} query={header}>{e => e && <div className="mb-4 flex items-center gap-3"><EquipmentStatus equipment={e} /><span className="t-mono text-sm text-text-secondary">{e.equipmentId}</span></div>}</QueryView>
    {!validTab ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={ko ? '등록되지 않은 탭입니다' : 'This tab is not registered'} body={ko ? '이 화면의 탭이 아닙니다. 속성으로 돌아가세요.' : 'This is not a tab on this page. Go back to attributes.'} action={<Button size="sm" variant="secondary" onClick={() => setPage({ tab: 'attributes' })}>{ko ? '속성 열기' : 'Open attributes'}</Button>} /> :
      <Tabs value={requestedTab} onValueChange={tab => setPage({ tab })}>
        <TabsList aria-label={ko ? '설비 상세 탭' : 'Equipment detail tabs'} className="max-w-4xl">{tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}</TabsList>
        {tabs.map(t => <TabsContent key={t.id} value={t.id} className="mt-4 max-w-4xl"><div className="rounded-lg border border-border-subtle bg-surface-card p-4"><EquipmentPanel id={id} kind={t.id} /></div></TabsContent>)}
      </Tabs>}
  </PlatformPage>;
}
