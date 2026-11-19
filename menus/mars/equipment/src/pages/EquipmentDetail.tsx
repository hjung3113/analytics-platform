import { useId } from 'react';
import { useMessages } from '@ap/kernel';
import { EQUIPMENT_MESSAGES } from '../messages';
import { formatDateTime, parseDateTime } from '@ap/contracts';
import { AlertTriangle } from 'lucide-react';
import { type PageProps, PlatformLink, useEntityAudit, useEntityQuery, useI18n, usePlatform } from '@ap/kernel';
import { AuditTimeline, DataTrustIndicator, PlatformPage, QueryView, ReturnLink, StateMessage } from '@ap/components';
import { Button, FieldList, FieldRow, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { EQUIPMENT_ENTITY_TYPE, type Equipment } from '../endpoints';
import { equipmentDateText, fields, statusText, statusTone, validity } from './data';

// EV host module menu (apps/platform-web mounts it); its page key `equipment` selects the equipment.
const CYCLE_TIME_MENU_ID = 'cycle-time';
const EV_TOP_VIEW_MENU_ID = 'eqv:topview';

export function EquipmentStatus({ equipment }: { equipment: Equipment }) {
  const { lang } = useI18n();
  return <StatusBadge tone={statusTone[equipment.status]} dot>{statusText[equipment.status][lang]}</StatusBadge>;
}

export function EquipmentPanel({ id, kind }: { id: string; kind: 'attributes' | 'validity' | 'audit' | 'analysis' }) {
  const m = useMessages(EQUIPMENT_MESSAGES);
  const { global, scope, registry, resolveLink } = usePlatform();
  const { lang, tx } = useI18n();
  const hintId = useId();
  const cycleLink = kind === 'analysis' ? resolveLink(CYCLE_TIME_MENU_ID, { global: { selection: [id] } }) : null;
  const cycle = cycleLink?.kind === 'link' && cycleLink.allowed ? cycleLink : null;
  const cycleHint = cycle?.missingRequired?.length ? m('equipmentDetailQueryConditionsRequired', {
    destination: tx(registry.menuById(CYCLE_TIME_MENU_ID).label),
    conditions: cycle.missingRequired.map(item => tx(item.label)).join(', '),
  }) : null;
  // An assembly without the EV module resolves to `none` (06 §22): no button. No permission ⇒ no link.
  const topViewLink = resolveLink(EV_TOP_VIEW_MENU_ID, { page: { equipment: id } });
  const topView = topViewLink.kind === 'link' && topViewLink.allowed ? topViewLink : null;
  const query = useEntityQuery<Equipment>({ type: EQUIPMENT_ENTITY_TYPE, id, scopeId: global.scopeId }, null, kind !== 'audit' && scope.status === 'valid');
  // #50: the audit tab reads the destination's changes from the port, not the entity payload. Session identity
  // (ADR-0085): the ref carries the scope, so a scope change reads again, a period change does not. Older pages are
  // appended by the timeline's own control; the first page's data below is not used.
  const audit = useEntityAudit({ type: EQUIPMENT_ENTITY_TYPE, id, scopeId: global.scopeId }, kind === 'audit' && scope.status === 'valid');
  if (kind === 'audit') return <QueryView widgetName={m('equipmentDetailChangeHistory')} query={audit.query}>{() => <div className="space-y-4">
    <p className="t-caption text-text-muted">{m('equipmentDetailExampleAuditEventsSyntheticData')}</p>
    <AuditTimeline {...audit.timeline} />
  </div>}</QueryView>;
  return <QueryView widgetName={m('equipmentDetailEquipmentDetails')} query={query}>{(e, response) => e && <div className="space-y-4">
    {/* The detail drawer is narrow: `wrap` lets the three fragments (headline · coverage · updated) break only between
      each other and keeps the text left-aligned; break-keep holds Korean word breaks. */}
    <DataTrustIndicator trust={response.trust} assessments={response.assessments} className="break-keep" wrap />
    {kind === 'attributes' && <>
      <FieldList>{fields.map(f => <FieldRow layout="detail" key={f.key} label={f[lang]} mono={f.key === 'equipmentId'}>{f.key === 'status' ? <EquipmentStatus equipment={e} /> : e[f.key] == null ? '—' : equipmentDateText(f.key, String(e[f.key]))}</FieldRow>)}</FieldList>
      <p className="t-caption text-text-muted">{m('equipmentDetailStgroupAndTeamExternalSystemValuesAll')}</p>
    </>}
    {kind === 'validity' && <>
      <p className="t-caption text-text-muted">{m('equipmentDetailSyntheticAttributeVersionsStartInclusiveEndExclusive')}</p>
      <ol className="space-y-3 border-l-2 border-border-strong pl-4">{validity(e).map((v, i) => <li key={v.from} className="rounded-md border border-border-subtle bg-surface-card p-3">
        <h3 className="t-card-title">{m('equipmentDetailAttributeVersion')} {i + 1}</h3>
        <p className="t-mono mt-1 text-text-secondary">{formatDateTime(parseDateTime(v.from, 'validFrom')).slice(0, 10)} → {v.to ? formatDateTime(parseDateTime(v.to, 'validTo')).slice(0, 10) : (m('equipmentDetailCurrentOpenEnd'))}</p>
        <p className="mt-2 text-sm">{m('equipmentDetailChamberType')}: {v.chamberType}</p>
      </li>)}</ol>
      {e.validTo && <p className="text-sm">{m('equipmentDetailThisIdIsRetiredTheRecordAnd')}</p>}
    </>}
    {kind === 'analysis' && <>
      <p className="text-sm">{m('equipmentDetailTheCycleTimeLinkChangesTheEquipment')}</p>
      <div className="flex flex-wrap items-start gap-2">
        {cycle && <div className="grid justify-items-start gap-1">
          <Button asChild size="sm"><PlatformLink href={cycle.href} aria-describedby={cycleHint ? hintId : undefined}>{m('equipmentDetailCycleTimeForThisEquipment')}</PlatformLink></Button>
          {cycleHint && <p id={hintId} className="text-xs text-text-secondary break-keep">{cycleHint}</p>}
        </div>}
        {topView && <Button asChild size="sm" variant="secondary"><PlatformLink href={topView.href}>{m('equipmentDetailTopViewForThisEquipment')}</PlatformLink></Button>}
      </div>
    </>}
  </div>}</QueryView>;
}

export default function EquipmentDetail({ params }: PageProps) {
  const m = useMessages(EQUIPMENT_MESSAGES);
  const id = params.equipmentId;
  const { global, scope, pageParam, setPage } = usePlatform();
  const requestedTab = pageParam('tab') ?? 'attributes';
  const tabs = [{ id: 'attributes', label: m('equipmentDetailAttributes') }, { id: 'validity', label: m('equipmentDetailValidityHistory') }, { id: 'audit', label: m('equipmentDetailChangeHistory2') }, { id: 'analysis', label: m('equipmentDetailRelatedAnalysis') }] as const;
  const validTab = tabs.some(t => t.id === requestedTab);
  const header = useEntityQuery<Equipment>({ type: EQUIPMENT_ENTITY_TYPE, id, scopeId: global.scopeId }, null, scope.status === 'valid');
  return <PlatformPage title={<span className="t-mono">{id}</span>}
    description={m('equipmentDetailThisEquipmentIsSeparateFromTheEquipment')}
    secondaryActions={<ReturnLink />}>
    <QueryView widgetName={m('equipmentDetailEquipmentSummary')} query={header}>{e => e && <div className="mb-4 flex items-center gap-3"><EquipmentStatus equipment={e} /><span className="t-mono text-sm text-text-secondary">{e.equipmentId}</span></div>}</QueryView>
    {!validTab ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={m('equipmentDetailThisTabIsNotRegistered')} body={m('equipmentDetailGoBackToTheAttributesTab')} action={<Button size="sm" variant="secondary" onClick={() => setPage({ tab: 'attributes' })}>{m('equipmentDetailOpenAttributes')}</Button>} /> :
      <Tabs value={requestedTab} onValueChange={tab => setPage({ tab })}>
        <TabsList aria-label={m('equipmentDetailEquipmentDetailTabs')} className="max-w-4xl">{tabs.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}</TabsList>
        {tabs.map(t => <TabsContent key={t.id} value={t.id} className="mt-4 max-w-4xl"><div className="rounded-lg border border-border-subtle bg-surface-card elevation-panel p-4"><EquipmentPanel id={id} kind={t.id} /></div></TabsContent>)}
      </Tabs>}
  </PlatformPage>;
}
