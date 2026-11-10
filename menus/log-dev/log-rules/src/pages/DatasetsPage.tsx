import { ExternalLink } from 'lucide-react';
import { useCallback } from 'react';
import { AuditTimeline, DataTrustIndicator, DetailDrawer, PlatformDataTable, PlatformPage, RowAction } from '@ap/components';
import { PlatformLink, useMenuAction, useMenuQuery, usePlatform, type PageProps } from '@ap/kernel';
import type { AuditEvent } from '@ap/contracts';
import { DatasetScreen, DatasetsScreen, type Action, type BaselineEvent, type DatasetApi, type Params, type Presentation, type ReadState, type TableParts } from '@ap/feature-screens/operator-screens/log-datasets';
import { DATASET_APPROVE, DATASET_MANAGE, DATASET_RUN, datasetActions, datasetEndpoints, isUuid } from '../endpoints';

function useRead<T>(name: string, params: Params, enabled = true): ReadState<T> {
  const spec = datasetEndpoints[name];
  if (!spec) throw new Error(`Unknown dataset read: ${name}`);
  const query = useMenuQuery(spec, params, enabled);
  const response = query.response;
  return { status: response ? response.outcome === 'ok' || response.outcome === 'empty' ? 'done' : 'error' : 'loading', data: response?.data as T | null, completedAt: query.completedAt, denied: response?.outcome === 'forbidden', retry: query.refetch };
}
function useAction(name: string): Action {
  const spec = datasetActions[name];
  if (!spec) throw new Error(`Unknown dataset action: ${name}`);
  return useMenuAction(spec);
}
const api: DatasetApi = { useRead, useAction };
function Table<T extends { id: string }>({ rows, title, columns, pagination, preferenceKey, fill, summary, search, rowAction, loading }: TableParts<T>) {
  return <div className={fill ? 'flex min-h-0 min-w-0 flex-1 flex-col [&_[data-table-search]]:max-w-none' : 'grid min-w-0 grid-cols-1'}><PlatformDataTable title={title} ariaLabel={title} getRowId={r => r.id} columns={columns} rows={rows} rowsLoading={loading} preferenceKey={preferenceKey} fill={fill} search={search} rowAction={rowAction ? (r, { compact }) => <RowAction compact={compact} icon={ExternalLink} label={rowAction.label(r)} text="열기" onClick={() => rowAction.open(r)} /> : undefined} externalPagination={pagination ? { summary, controls: pagination } : undefined} /></div>;
}
const eventName: Record<string, string> = { created: '초안 생성', updated: '초안 변경', approved: '승인', superseded: '이전 기준으로 전환', self_approved: '자기 승인' };
function timeline(events: BaselineEvent[], baselineId: string) {
  const mapped: AuditEvent[] = events.map(e => ({ id: e.id, at: e.at, actor: e.actor.displayName || '이름 확인 불가', action: e.kind === 'created' ? 'create' : 'update', source: 'user', target: { type: 'dataset_baseline', id: baselineId, scopeId: null }, reason: [e.reason, e.selfApproved ? '자기 승인' : null].filter(Boolean).join(' · ') || undefined, changes: { [eventName[e.kind] ?? e.kind]: [JSON.stringify(e.before), JSON.stringify(e.after)] } }));
  return <AuditTimeline events={mapped} />;
}
const ui: Presentation = {
  page: parts => <DatasetPageFrame {...parts} />,
  cellLink: parts => <DatasetCellLink {...parts} />,
  table: parts => <Table {...parts} />,
  drawer: parts => <DetailDrawer title={parts.title} onClose={parts.requestClose} returnFocusRef={parts.returnFocusRef} footer={parts.footer} tabs={[{ id: 'detail', label: '상세', content: parts.body }]} />,
  timeline,
  trust: (reasons, completedAt) => <DataTrustIndicator summary wrap trust={{ updatedAt: new Date(completedAt ?? 0).toISOString(), dataThrough: null, coverage: null, provisional: false, source: 'Baseline 승인 가능 여부' }} assessments={reasons.map(detail => ({ kind: 'coverage', state: 'unknown', reason: 'check_failed', detail }))} />,
};
function DatasetPageFrame(parts: Parameters<Presentation['page']>[0]) {
  const { linkTo } = usePlatform();
  // The Registry already supplies the list parent crumb on both hidden detail routes.
  const crumbs = parts.crumbs?.filter(c => c.label !== '테스트 데이터셋').map(c => ({ label: c.label, ...(c.datasetId ? { href: linkTo('log-dataset', { params: { datasetId: c.datasetId } }) } : {}) }));
  return <PlatformPage layout="fill" title={parts.title} crumbs={crumbs} primaryAction={parts.primaryAction}>{parts.children}</PlatformPage>;
}
function DatasetCellLink(parts: Parameters<Presentation['cellLink']>[0]) {
  const { linkTo } = usePlatform();
  return parts.datasetId ? <PlatformLink className="min-w-0 truncate text-accent-primary hover:underline" href={linkTo('log-dataset', { params: { datasetId: parts.datasetId }, returnTo: true })}>{parts.children}</PlatformLink> : <button type="button" aria-label={parts.label} className="min-w-0 truncate text-left text-accent-primary hover:underline" onClick={parts.onClick}>{parts.children}</button>;
}
// One entry, in memory only: retain run paging across the route outlet's ID remounts.
// Session/workspace revision + actor + dataset identity prevents reuse across access boundaries.
let rememberedRuns: { identity: string; current: { suiteId: string; page: number; suitePage: number } } | undefined;
export default function DatasetsPage({ params = {} }: PageProps) {
  const { user, revision, can, navigate, linkTo } = usePlatform();
  const navigateDataset = useCallback((datasetId?: string, suiteRunId?: string) => {
    if (!datasetId) navigate(linkTo('log-datasets'));
    else if (isUuid(datasetId) && (!suiteRunId || isUuid(suiteRunId))) navigate(linkTo(suiteRunId ? 'log-dataset-run' : 'log-dataset', { params: { datasetId, ...(suiteRunId ? { suiteRunId } : {}) }, returnTo: true }));
  }, [navigate, linkTo]);
  const invalid = params.datasetId && !isUuid(params.datasetId) || params.suiteRunId && !isUuid(params.suiteRunId);
  const identity = JSON.stringify([user.id, revision, params.datasetId]);
  const runNavigation = { current: rememberedRuns?.identity === identity ? rememberedRuns.current : { suiteId: '', page: 0, suitePage: 0 }, change(next: { suiteId: string; page: number; suitePage: number }) { runNavigation.current = next; rememberedRuns = { identity, current: next }; } };
  const props = { api, ui, runNavigation, actorId: user.id, canManage: can(DATASET_MANAGE), canApprove: can(DATASET_APPROVE), canRun: can(DATASET_RUN), navigate: navigateDataset };
  return <div key={`${user.id}:${revision}:${params.datasetId ?? 'list'}`} className="flex min-h-0 min-w-0 flex-1 flex-col break-keep">{invalid ? <PlatformPage><p role="alert" className="text-sm">주소의 ID가 올바르지 않습니다.</p></PlatformPage> : params.datasetId ? <DatasetScreen {...props} datasetId={params.datasetId} {...(params.suiteRunId ? { suiteRunId: params.suiteRunId } : {})} /> : <DatasetsScreen {...props} />}</div>;
}
