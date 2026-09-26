import { type PageProps, PlatformLink, useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { AuditTimeline, DataTrustIndicator, Field, PlatformPage, QueryView } from '@ap/components';
import { Button, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import type { Equipment } from '@ap/mock-server';
import { audit, equipmentRequest, fields, statusText, statusTone, validity } from './data';

export function EquipmentStatus({ equipment }: { equipment: Equipment }) {
  const { lang } = useI18n();
  return <StatusBadge tone={statusTone[equipment.status]} dot>{statusText[equipment.status][lang]}</StatusBadge>;
}

export function EquipmentPanel({ id, kind }: { id: string; kind: 'attributes' | 'validity' | 'audit' | 'analysis' }) {
  const { global, scope, linkTo } = usePlatform();
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const query = usePlatformQuery(signal => equipmentRequest(global, id, signal), [id, kind], scope.status === 'valid');
  return <QueryView query={query}>{(e, response) => e && <div className="space-y-4">
    <DataTrustIndicator trust={response.trust} assessments={response.assessments} />
    {kind === 'attributes' && <>
      <dl>{fields.map(f => <Field key={f.key} label={f[lang]} mono={f.key === 'equipmentId'}>{f.key === 'status' ? <EquipmentStatus equipment={e} /> : e[f.key] ?? '—'}</Field>)}</dl>
      <p className="t-caption text-text-muted">{ko ? 'StGroup·분임조: 현재 외부 공급값. 그 외 필드 원천 소유권은 Open이며 편집은 제공하지 않습니다.' : 'StGroup and team: current external values. Other field ownership is Open; editing is not provided.'}</p>
    </>}
    {kind === 'validity' && <>
      <p className="t-caption text-text-muted">{ko ? '합성 속성 버전 · 구간은 [시작, 종료). StGroup·분임조의 과거 소속을 추정하지 않습니다.' : 'Synthetic attribute versions · intervals are [from, to). Historical StGroup/team membership is not inferred.'}</p>
      <ol className="space-y-3 border-l-2 border-border-strong pl-4">{validity(e).map((v, i) => <li key={v.from} className="rounded-md border border-border-subtle bg-surface-card p-3">
        <h3 className="t-card-title">{ko ? '속성 버전' : 'Attribute version'} {i + 1}</h3>
        <p className="t-mono mt-1 text-text-secondary">{v.from} → {v.to ?? (ko ? '현재 (종료 없음)' : 'Current (open end)')}</p>
        <p className="mt-2 text-sm">{ko ? '챔버 유형' : 'Chamber type'}: {v.chamberType}</p>
      </li>)}</ol>
      {e.validTo && <p className="text-sm">{ko ? '유효 종료된 ID입니다. 레코드와 이력은 보존됩니다.' : 'This ID is retired. The record and history are retained.'}</p>}
    </>}
    {kind === 'audit' && <><p className="t-caption text-text-muted">{ko ? '합성 감사 이벤트 · 실제 변경 기록이 아닙니다.' : 'Synthetic audit events · not real change records.'}</p><AuditTimeline events={audit(e)} /></>}
    {kind === 'analysis' && <>
      <p className="text-sm">{ko ? '아래 링크를 클릭하면 분석 Selection을 이 설비 한 대로 명시적으로 교체합니다. 현재 상세를 여는 것만으로는 Selection이 바뀌지 않습니다.' : 'Clicking this link explicitly replaces the analysis Selection with this equipment. Opening details alone does not change Selection.'}</p>
      <Button asChild size="sm"><PlatformLink href={linkTo('cycle-time', { global: { selection: [id] } })}>{ko ? '이 설비로 사이클타임 상세' : 'Cycle time for this equipment'}</PlatformLink></Button>
    </>}
  </div>}</QueryView>;
}

export default function EquipmentDetail({ params }: PageProps) {
  const id = params.equipmentId;
  const { lang } = useI18n();
  const { global, scope, pageParam, setPage, returnTarget } = usePlatform();
  const ko = lang === 'ko';
  const requestedTab = pageParam('tab') ?? 'attributes';
  const tabs = [{ id: 'attributes', label: ko ? '속성' : 'Attributes' }, { id: 'validity', label: ko ? '유효구간' : 'Validity' }, { id: 'audit', label: 'Audit' }, { id: 'analysis', label: ko ? '관련 분석' : 'Related analysis' }] as const;
  const validTab = tabs.some(t => t.id === requestedTab);
  const header = usePlatformQuery(signal => equipmentRequest(global, id, signal), [id, 'header'], scope.status === 'valid');
  return <PlatformPage title={<span className="t-mono">{id}</span>}
    description={ko ? '목적지 ID는 위의 전달된 분석 Selection과 별개입니다. Scope와 설비 접근 권한은 다시 검증합니다.' : 'The destination ID is separate from the inherited analysis Selection above. Scope and equipment access are revalidated.'}
    secondaryActions={<Button asChild variant="secondary" size="sm"><PlatformLink href={returnTarget()}>{ko ? '이전 화면으로' : 'Back to previous view'}</PlatformLink></Button>}>
    <QueryView query={header}>{e => e && <div className="mb-4 flex items-center gap-3"><EquipmentStatus equipment={e} /><span className="text-sm text-text-secondary">{e.name}</span></div>}</QueryView>
    {!validTab ? <p role="alert">{ko ? '등록되지 않은 탭입니다.' : 'Unknown tab.'} <Button size="sm" variant="secondary" onClick={() => setPage({ tab: 'attributes' })}>{ko ? '속성 열기' : 'Open attributes'}</Button></p> :
      <Tabs value={requestedTab} onValueChange={tab => setPage({ tab })}>
        <TabsList aria-label={ko ? '설비 상세 탭' : 'Equipment detail tabs'}>{tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}</TabsList>
        {tabs.map(t => <TabsContent key={t.id} value={t.id} className="mt-4 max-w-4xl rounded-lg border border-border-subtle bg-surface-card p-4"><EquipmentPanel id={id} kind={t.id} /></TabsContent>)}
      </Tabs>}
  </PlatformPage>;
}
