import { useMemo, useState } from 'react';
import { DetailDrawer, QueryView, TableUrlWarning, useTableUrlState, type PlatformColumn } from '@ap/components';
import { PlatformLink, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { COVERAGE_STATES, coverageEndpoint, coverageSummaryEndpoint, ruleDetailEndpoint, type CoverageData, type DeclaringRule, type RequirementRow } from '../endpoints';
import { CoverageBadge, EmptyNote, Original, ReasonState, Section, SupportBadge } from './presentation';
import { CoveragePicker } from './CoveragePicker';
import { MissingDrawer } from './RuleDrawer';
import { SnapshotTable } from './SnapshotTable';
import { usePageWriter } from './usePageWriter';

function CoverageSelector({ modelId, softwareId, children }: { modelId: string | null; softwareId: string | null; children: React.ReactNode }) {
  const { setPage } = usePlatform();
  return <div className="grid min-w-0 grid-cols-1 gap-2"><div className="flex min-w-0 flex-wrap items-center gap-2">
    <CoveragePicker modelId={modelId} softwareId={softwareId} onChange={next => setPage({ modelId: next.modelId, softwareId: next.softwareId, page: null, focus: null })} />
    {children}
  </div></div>;
}
export function CoverageTab({ modelId, softwareId, onOpenRule }: { modelId: string | null; softwareId: string | null; onOpenRule: () => void }) {
  const { pageParam, setPage, linkTo } = usePlatform();
  const url = useTableUrlState([]);
  const page = (url.urlState?.page ?? 1) - 1;
  const query = useMenuQuery(coverageEndpoint, { modelId: modelId ?? '', softwareId, page, pageSize: 50 }, modelId !== null && !url.invalid);
  const summary = useMenuQuery(coverageSummaryEndpoint, { modelIds: modelId ? [modelId] : [] }, modelId !== null);
  const currentSummary = summary.response?.outcome === 'ok' ? summary.response.data?.rows.find(r => r.modelId === modelId) : undefined;
  return <div className="grid min-w-0 grid-cols-1 gap-3">
    <CoverageSelector modelId={modelId} softwareId={softwareId}>
    {modelId && <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs"><PlatformLink className="text-accent-primary" href={linkTo('log-knowledge-spec', { params: { modelId }, page: softwareId ? { software: softwareId } : {}, returnTo: true })}>모델 명세</PlatformLink>
      {softwareId && currentSummary && <span className="text-text-muted">모델 기준: {currentSummary.computable ? `명세 요구사항 ${currentSummary.counts.total}개` : '계산할 수 없음'}</span>}
    </div>}
    </CoverageSelector>
    {url.invalid ? <TableUrlWarning sentences={url.sentences} recoverKeys={url.recoverKeys} cause={url.cause} /> : !modelId ? <EmptyNote title="모델을 선택해 주세요" body="위에서 모델을 고르면 그 모델의 명세 커버리지를 봅니다." /> : <QueryView query={query}>{data => <>
      {data && !data.computable && data.specPin && <div className="text-xs text-text-muted"><Original>spec_pin: {data.specPin.revisionId} · {data.specPin.changeSetDigest}</Original></div>}
      {!data ? <ReasonState reason="model_unknown" /> : !data.computable ? <ReasonState reason={data.reason} /> : <ComputedCoverage key={JSON.stringify([data.coverageDigest, query.completedAt])} onRefresh={query.refetch} onOpenRule={onOpenRule} data={data} modelId={modelId} softwareId={softwareId} urlState={url.urlState} />}
    </>}</QueryView>}
    {pageParam('focus') && !modelId && <Button type="button" variant="link" size="sm" onClick={() => setPage({ focus: null })}>요구사항 선택 해제</Button>}
  </div>;
}
function ComputedCoverage({ onRefresh, onOpenRule, data, modelId, softwareId, urlState }: { onRefresh: () => void; onOpenRule: () => void; data: Extract<CoverageData, { computable: true }>; modelId: string; softwareId: string | null; urlState: ReturnType<typeof useTableUrlState>['urlState'] }) {
  const { pageParam } = usePlatform();
  const setPage = usePageWriter();
  const fetcher = useMenuFetch(coverageEndpoint);
  const [mismatch, setMismatch] = useState(false);
  const focus = pageParam('focus');
  const row = data.rows.find(r => r.key === focus);
  const columns = useMemo<PlatformColumn<RequirementRow>[]>(() => [
    { id: 'key', header: '모듈/이벤트 키', sortable: false, size: 420, cell: r => <Button type="button" variant="link" size="sm" aria-label={`${r.key} 상세 보기`} onClick={() => setPage({ focus: r.key })}><Original>{r.key}</Original></Button> },
    { id: 'state', header: '상태', sortable: false, size: 140, cell: r => <CoverageBadge value={r.state} /> },
    { id: 'declaredCount', header: '선언한 Rule 수', sortable: false, size: 150, align: 'right' },
  ], [setPage]);
  const percentage = data.counts.total > 0 ? Math.floor(data.counts.covered / data.counts.total * 100) : null;
  if (mismatch) return <div role="alert" className="grid gap-2 break-keep text-xs">
    <p>명세 커버리지 구성이 바뀌었습니다. 다시 조회해 주세요.</p>
    <Button type="button" variant="secondary" size="toolbar" onClick={onRefresh}>명세 커버리지 새로고침</Button>
  </div>;
  return <div className="grid min-w-0 grid-cols-1 gap-3">
    <div className="text-xs text-text-muted"><Original>spec_pin: {data.specPin.revisionId} · {data.specPin.changeSetDigest}</Original></div>
    <div className="flex flex-wrap items-center gap-3 text-xs">{COVERAGE_STATES.map(state => <span key={state} className="inline-flex items-center gap-1.5"><CoverageBadge value={state} /><span className="tabular">{data.counts[state]}</span></span>)}</div>
    <p className="text-xs text-text-secondary">{percentage !== null ? `명세 커버리지 ${percentage}% · ` : ''}통과가 아니라 구성 정보입니다</p>
    <SnapshotTable<RequirementRow> title="명세 요구사항" ariaLabel="명세 요구사항" columns={columns} getRowId={r => r.key} pageSize={50} urlState={urlState} activeRowId={focus}
      preferenceKey="log-rules-coverage:v1" filterKey={JSON.stringify([modelId, softwareId, data.coverageDigest])}
      loadPage={async (q, signal) => {
        const response = await fetcher.fetch({ modelId, softwareId, page: q.page, pageSize: q.pageSize }, signal);
        if (response.outcome === 'ok' && (!response.data?.computable || response.data.coverageDigest !== data.coverageDigest)) {
          if (!signal.aborted) setMismatch(true);
          return { ...response, outcome: 'error', data: null, message: '명세 커버리지 구성이 바뀌었습니다. 다시 조회해 주세요.' };
        }
        if (response.outcome !== 'ok' || !response.data?.computable) return { ...response, data: null };
        return { ...response, outcome: response.data.total === 0 ? 'empty' : 'ok', data: { rows: response.data.rows, total: response.data.total } };
      }} />
    {focus && (row ? <RequirementDrawer onOpenRule={onOpenRule} row={row} onClose={() => setPage({ focus: null })} /> : <MissingDrawer title="명세 요구사항을 찾을 수 없습니다" body="선택한 명세 또는 표 페이지에 없는 요구사항입니다." onClose={() => setPage({ focus: null })} />)}
  </div>;
}
function RequirementDrawer({ row, onClose, onOpenRule }: { row: RequirementRow; onClose: () => void; onOpenRule: () => void }) {
  const { setPage } = usePlatform();
  return <DetailDrawer title={<span className="t-mono">{row.key}</span>} onClose={onClose} tabs={[{ id: 'requirement', label: '명세 요구사항', content: <div className="grid min-w-0 gap-5 break-keep text-xs">
    <Section title="명세 요구사항"><Original>{row.key}</Original><div><CoverageBadge value={row.state} /></div></Section>
    <Section title={`선언한 Rule ${row.declaredCount}개`}>{row.declaredBy.length === 0 ? <p>이 명세 요구사항을 선언한 규칙이 없습니다.</p> : row.declaredBy.map(rule => <div key={JSON.stringify([rule.ruleSetKey, rule.revision, rule.ruleKey])} className="grid min-w-0 gap-1">
      <Button type="button" variant="link" size="sm" onClick={() => { onOpenRule(); setPage({ tab: 'rules', focus: null, page: null, ruleSetKey: rule.ruleSetKey, ruleKey: rule.ruleKey }); }}><Original>{rule.ruleSetKey} / {rule.ruleKey}</Original></Button>
      <div className="flex flex-wrap items-center gap-2"><Original>{rule.revision}</Original><SupportBadge value={rule.support} /></div>
      <DeclarationTargets rule={rule} requirementKey={row.key} />
    </div>)}
    {row.declaredCount > row.declaredBy.length && <p>선언한 Rule 중 처음 {row.declaredBy.length}개를 표시합니다.</p>}</Section>
  </div> }]} />;
}

/** Detail is a current/latest projection: never present a newer Revision's declaration as the pinned coverage Revision. */
function DeclarationTargets({ rule, requirementKey }: { rule: DeclaringRule; requirementKey: string }) {
  const query = useMenuQuery(ruleDetailEndpoint, { ruleSetKey: rule.ruleSetKey, ruleKey: rule.ruleKey });
  return <QueryView query={query} compact>{detail => detail && detail.revision === rule.revision ? <>{detail.targets.filter(t => t.requirementIds.includes(requirementKey)).map(t => <div key={t.position} className="grid min-w-0 gap-1"><Original>{t.format}</Original><Original>{t.target}</Original></div>)}</> : <p className="text-text-muted">이 Revision의 대상 범위 원문은 현재 카탈로그 상세에서 확인할 수 없습니다.</p>}</QueryView>;
}
