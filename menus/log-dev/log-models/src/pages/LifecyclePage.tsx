import { useCallback, useMemo } from 'react';
import { AuditTimeline, DataTrustIndicator, PageKeyWarning, usePageKeyRules, DetailDrawer, PlatformDataTable, PlatformPage } from '@ap/components';
import { PlatformLink, useEndpointRefreshEpoch, useMenuAction, useMenuFetch, useMenuQuery, usePlatform, usePlatformQuery, type PageProps } from '@ap/kernel';
import { defineEndpoint, type AuditEvent, type EndpointSpec } from '@ap/contracts';
import { GATE_LABEL, STAGE_LABEL, LifecycleHost, ModelsScreen, ProjectScreen, RequestsScreen, type Action, type LifecycleApi, type Params, type Presentation, type ProjectEvent, type ReadState, type ScreenProps, type TableParts } from '@ap/feature-screens/operator-screens/log-lifecycle';
import { roundSourceView } from '../round-source-slot';
import { actions, endpoints, isUuid, PROJECT_MANAGE, ROUND_MANAGE, GATE_DECIDE, ISSUE_CONTRIBUTE, ISSUE_LINK } from '../endpoints';
import { isModelHierarchyNodeId } from '../hierarchy';

// Lookup mirrors only; these are owned and implemented by log-knowledge, never contributed a second time.
const lookupEndpoints: Record<string, EndpointSpec<Params, unknown>> = Object.fromEntries(['vendors', 'processes'].map(name => [name, defineEndpoint<Params, unknown>({ id: `logKnowledge.${name}`, menuId: 'log-knowledge-catalog', permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false, paramKeys: { q: true, page: true, pageSize: true, sorting: true, filters: true } })]));

/** Source excerpts/evidence states and human validation records (#1808 N3: issue bodies, threads, history, Round discussion, titles). */
const PROTECTED_READS = new Set(['excerpt', 'evidenceStates', 'validationIssues', 'validationIssueDetail', 'validationIssueThread', 'validationIssueHistory', 'roundDiscussion']);
function useRead<T>(name: string, params: Params, enabled = true): ReadState<T> {
  const { pageParam, route } = usePlatform();
  const listRead = name === 'models' && route?.menu.id === 'log-models';
  const modelId = listRead ? pageParam('modelId') : null;
  const projected = listRead ? { ...params, filters: [
    ...((params.filters ?? []) as { id: string; op: string; value?: string[] }[]).map(f => f.id === 'processes' && f.value?.includes('none') ? { id: 'processes', op: 'isEmpty' } : f),
    ...(modelId ? [{ id: 'id', op: 'in', value: [modelId] }] : []),
  ] } : params;
  const spec = endpoints[name] ?? lookupEndpoints[name];
  if (!spec) throw new Error(`Unknown lifecycle read: ${name}`);
  // Protected reads run on a per-instance query (the #1815 A3 mechanism): each mount (drawer open, page, list) starts with no
  // prior result and shows only what that instance itself received, so a cached body never outlives a close or a revoked
  // right, also offline (a paused re-read of a shared key would show the old answer as `done`). Write invalidation still
  // re-reads through the endpoint refresh epoch. Every other read stays on the shared menu query.
  const gated = PROTECTED_READS.has(name);
  const shared = useMenuQuery(spec, projected, enabled && !gated);
  const { ready, fetch } = useMenuFetch(spec);
  const epoch = useEndpointRefreshEpoch(gated ? [spec.id] : []);
  const own = usePlatformQuery(signal => fetch(projected, signal), [spec.id, projected], enabled && gated && ready, 'context', epoch);
  const query = gated ? own : shared;
  // Within one instance a re-read (retry, write refresh) never shows the prior answer either: a revoked right must not re-show it.
  const response = gated && query.status === 'refreshing' ? undefined : query.response;
  return { status: response ? response.outcome === 'ok' || response.outcome === 'empty' ? 'done' : 'error' : 'loading', completedAt: query.completedAt, data: response?.data as T | null, denied: response?.outcome === 'forbidden', retry: query.refetch };
}
function useAction(name: string): Action {
  const spec = actions[name];
  if (!spec) throw new Error(`Unknown lifecycle action: ${name}`);
  return useMenuAction(spec);
}
const api: LifecycleApi = { useRead, useAction };
function MetadataTable<T extends { id: string }>({ rows, title, columns, rowAction, activeRowId, pagination, summary, fill, preferenceKey }: TableParts<T>) {
  return <div className="grid min-w-0 grid-cols-1"><PlatformDataTable title={title} hideTitle ariaLabel={title} getRowId={r => r.id} columns={columns} rows={rows} preferenceKey={preferenceKey} rowAction={rowAction} activeRowId={activeRowId} fill={fill} externalPagination={{ summary: summary ?? `${rows.length}건`, controls: pagination }} /></div>;
}
const eventLabels: Record<string, string> = { created: '개발 건 등록', stage_changed: '개발 단계', owner_changed: '담당', target_changed: '목표일·SW', cancelled: '취소', reopened: '재개', gate_decided: 'Gate 결정' };
const fieldLabels: Record<string, string> = { stage: '단계', ownerActorId: '담당 ID', targetDate: '목표일', softwareId: 'SW ID', decision: '결정', targetStage: '대상 단계', gateDecisionId: '결정 ID', selfApproved: '자기 승인' };
function snapshot(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return String(value);
  return Object.entries(value).map(([key, entry]) => `${fieldLabels[key] ?? key}: ${key === 'stage' || key === 'targetStage' ? STAGE_LABEL[String(entry)] ?? entry : key === 'decision' ? GATE_LABEL[String(entry)] ?? entry : entry === null ? '미지정' : String(entry)}`).join(' · ');
}
function timeline(events: ProjectEvent[], projectId: string) {
  const mapped: AuditEvent[] = events.map(e => ({ id: e.id, at: e.at, actor: e.actor.displayName || '이름 확인 불가', action: e.kind === 'created' ? 'create' : 'update', source: 'user', target: { type: 'log_project', id: projectId, scopeId: null }, reason: e.reason ?? undefined, changes: { [eventLabels[e.kind] ?? e.kind]: [snapshot(e.before), snapshot(e.after)] } }));
  return <AuditTimeline events={mapped} />;
}
const ui: Presentation = {
  // The app injects the body (round-source-slot.ts); read at render so a late `setRoundSourceView` is seen. A fixed height with a readable minimum gives the body's table its flex budget; the page itself scrolls when the viewport is short.
  get sourceView() {
    const View = roundSourceView();
    return View ? (parts: Parameters<NonNullable<Presentation['sourceView']>>[0]) => <div className="flex h-[calc(100vh-25rem)] min-h-[40rem] flex-col gap-2" data-testid="round-source-slot"><p className="shrink-0 break-keep text-xs text-text-secondary">이 Round의 샘플 목록을 읽기 전용으로 보여 줍니다. 근거 위치 담기와 조사 저장은 로그 탐색에서 합니다.</p><div className="min-h-0 flex-1"><View {...parts} /></div></div> : undefined;
  },
  table: parts => <MetadataTable {...parts} />,
  drawer: parts => <DetailDrawer title={parts.title} subtitle={parts.subtitle} onClose={parts.requestClose} returnFocusRef={parts.returnFocusRef} tabs={[{ id: 'detail', label: '상세', content: parts.body }]} />,
  timeline,
  trust: (reasons, completedAt) => completedAt ? <DataTrustIndicator summary wrap showWithoutTrust trust={null} assessments={reasons.length ? [{ kind: 'coverage', state: 'unknown', reason: 'check_failed', detail: reasons.join(', ') }] : []} /> : null,
};

export default function LifecyclePage({ params = {} }: PageProps) {
  const platform = usePlatform();
  const { page, pageParam, setPage, navigate, linkTo, can, user, revision } = platform;
  const navigateScreen = useCallback((to: string) => {
    const url = new URL(to, 'https://host.invalid');
    const match = /^\/log\/models\/([^/]+)(?:\/rounds\/([^/]+))?$/.exec(url.pathname);
    const model = /^\/log\/knowledge\/models\/([^/]+)$/.exec(url.pathname);
    if (match?.[1] && isUuid(match[1]) && (!match[2] || isUuid(match[2]))) navigate(linkTo(match[2] ? 'log-model-round' : 'log-model-project', { params: { projectId: match[1], ...(match[2] ? { roundId: match[2] } : {}) }, page: { node: match[1] === params.projectId ? pageParam('node') : null, ...Object.fromEntries(['request', 'attempt'].flatMap(key => { const value = url.searchParams.get(key); return value && isUuid(value) ? [[key, value]] : []; })) }, returnTo: true }));
    else if (model?.[1] && isUuid(model[1])) navigate(linkTo('log-knowledge-model', { params: { modelId: model[1] }, returnTo: true }));
    else if (url.pathname === '/log/models') navigate(linkTo('log-models'));
    else if (url.pathname === '/log/validation-requests') navigate(linkTo('log-validation-requests', { page: Object.fromEntries(url.searchParams) }));
  }, [navigate, linkTo, params.projectId, pageParam]);
  const props = useMemo<ScreenProps>(() => ({ api, ui, state: Object.fromEntries(page), setState: patch => setPage(Object.fromEntries(Object.entries(patch).map(([k,v]) => [k, v ?? null]))), actorId: user.id, canProject: can(PROJECT_MANAGE), canRound: can(ROUND_MANAGE), canGate: can(GATE_DECIDE), canContribute: can(ISSUE_CONTRIBUTE), canLink: can(ISSUE_LINK), selection: pageParam('request') ?? undefined, setSelection: id => setPage({ request: id ?? null }),
    // The RuleSet history of the validation rules menu (#1496); a registry without that menu shows the name without a link.
    RuleSetLink: ({ ruleSetKey, children }) => { let href: string | null = null; try { href = linkTo('log-rules', { page: { ruleSetKey } }); } catch { href = null; } return href ? <PlatformLink className="min-w-0 truncate text-accent-primary hover:underline" href={href}>{children}</PlatformLink> : children; } }), [page, user.id, can, pageParam, setPage, linkTo]);
  const projectId = params.projectId;
  const roundId = params.roundId;
  const selection = pageParam('request');
  const keys = usePageKeyRules([
    { key: 'node', label: { ko: '계층 노드', en: 'Hierarchy node' }, valid: isModelHierarchyNodeId },
    ...['request', 'attempt', 'rule', 'issue', 'vendorId', 'modelId'].map(key => ({ key, label: { ko: key, en: key }, valid: isUuid })),
    { key: 'processId', label: { ko: '공정', en: 'Process' }, valid: v => v === 'none' || isUuid(v) },
    ...['page', 'requestsPage', 'rulesPage'].map(key => ({ key, label: { ko: '페이지', en: 'Page' }, valid: (v: string) => /^[1-9]\d{0,6}$/.test(v) && Number(v) <= 1000001 })),
    { key: 'q', label: { ko: '검색', en: 'Search' }, valid: v => v.length <= 200 },
    { key: 'stage', label: { ko: '개발 단계', en: 'Stage' }, valid: v => ['registered','kickoff','alpha','beta','completed','cancelled','empty'].includes(v) },
    { key: 'validation', label: { ko: '검증 상태', en: 'Validation' }, valid: v => ['none','queued','claimed','pass','fail','incomplete'].includes(v) },
    { key: 'state', label: { ko: '요청 상태', en: 'Request state' }, valid: v => ['queued','claimed','succeeded','failed','cancelled','expired'].includes(v) },
    { key: 'priority', label: { ko: '우선순위', en: 'Priority' }, valid: v => ['0','1','2'].includes(v) },
    { key: 'tab', label: { ko: '탭', en: 'Tab' }, valid: v => ['rounds','history'].includes(v) },
    { key: 'view', label: { ko: '보기', en: 'View' }, valid: v => ['source', 'discussion', 'history'].includes(v) },
    { key: 'sourceTab', label: { ko: '원본/시퀀스', en: 'Source tab' }, valid: v => v === 'raw' || v === 'sequence' },
    { key: 'sourceFocus', label: { ko: '근거 위치', en: 'Evidence location' }, valid: v => { const m = /^([1-9]\d{0,6}):([1-9]\d*)$/.exec(v); return !!m && Number.isSafeInteger(Number(m[2])); } },
    { key: 'sourceDrawer', label: { ko: '서랍', en: 'Drawer' }, valid: v => v === 'record' },
    { key: 'result', label: { ko: '규칙 결과', en: 'Rule result' }, valid: v => ['all','problems','PASS','FAIL','ERROR','WARN','NOT_CHECKED','SKIPPED','NOT_APPLICABLE'].includes(v) },
    ...['required','active'].map(key => ({ key, label: { ko: key, en: key }, valid: (v: string) => ['true','false'].includes(v) })),
    { key: 'sort', label: { ko: '정렬', en: 'Sort' }, valid: v => ['code','vendorName','stage','updatedAt','ruleId','result','required'].includes(v) },
    ...['requestedFrom','requestedTo'].map(key => ({ key, label: { ko: key, en: key }, valid: (v: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}:00+09:00`)) })),
  ]);
  const invalid = (projectId && !isUuid(projectId)) || (roundId && !isUuid(roundId)) || (selection && !isUuid(selection));
  return <PlatformPage><LifecycleHost navigate={navigateScreen}><div key={`${user.id}:${revision}`} className="min-w-0">
    {keys.invalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} /> : invalid ? <p role="alert" className="text-sm">주소의 ID가 올바르지 않습니다.</p> : projectId ? <ProjectScreen key={projectId} {...props} projectId={projectId} {...(roundId ? { roundId } : {})} /> : platform.route?.menu.id === 'log-validation-requests' ? <RequestsScreen {...props} /> : <ModelsScreen {...props} />}
  </div></LifecycleHost></PlatformPage>;
}
