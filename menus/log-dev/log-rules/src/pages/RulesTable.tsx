import { parseFilterParams, type ColumnFilterSpec } from '@ap/contracts';
import { useMemo, useState } from 'react';
import { useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { TableUrlWarning, useTableUrlState, type PlatformColumn, type TableFilterField } from '@ap/components';
import { Button, SearchInput } from '@ap/ui';
import { RULE_SORT_IDS, ruleFilterSpecs, rulesEndpoint, ruleSetsEndpoint, type RuleRow } from '../endpoints';
import { Original, scopeSummary, SupportBadge } from './presentation';
import { SnapshotTable } from './SnapshotTable';
import { usePageWriter } from './usePageWriter';

const FIELD_LABELS = { ruleSetKey: 'RuleSet', support: '지원', scope: '지원 범위', requirementIds: '요구사항 ID' };
export function CommittedSearch({ pageKey, placeholder }: { pageKey: string; placeholder: string }) {
  const { pageParam, setPage } = usePlatform();
  const q = pageParam(pageKey) ?? '';
  const [draft, setDraft] = useState({ applied: q, text: q });
  if (draft.applied !== q) setDraft({ applied: q, text: q });
  return <SearchInput placeholder={placeholder} aria-label={placeholder} value={draft.text} onValueChange={text => setDraft({ applied: q, text })}
    onCommit={() => setPage({ [pageKey]: draft.text.trim() || null, page: null })} />;
}
export function RulesTable() {
  const { pageParam, pageParams } = usePlatform();
  const setPage = usePageWriter();
  const q = pageParam('q'), targetQ = pageParam('targetQ');
  const rules = useMenuFetch(rulesEndpoint);
  const sets = useMenuQuery(ruleSetsEndpoint, { page: 0, pageSize: 200 });
  const chosen = pageParams('filter').join('\n');
  const specs = useMemo<Record<string, ColumnFilterSpec>>(() => {
    const options = new Set(sets.response?.data?.rows.map(r => r.ruleSetKey) ?? []);
    // Dynamic options retain ids already chosen by the URL, using the shared codec.
    const parsed = parseFilterParams(chosen ? chosen.split('\n') : [], ruleFilterSpecs);
    if (parsed.ok) for (const filter of parsed.filters) if (filter.id === 'ruleSetKey' && (filter.op === 'in' || filter.op === 'notIn')) for (const id of filter.value) options.add(id);
    return { ...ruleFilterSpecs, ruleSetKey: { ...ruleFilterSpecs.ruleSetKey!, options: [...options].map(value => ({ value, label: value })) } };
  }, [sets.response, chosen]);
  const filters = useMemo(() => ({ key: 'filter', specs, labels: FIELD_LABELS }), [specs]);
  const url = useTableUrlState(RULE_SORT_IDS, { filters });
  const columns = useMemo<PlatformColumn<RuleRow>[]>(() => [
    { id: 'ruleSetKey', header: 'RuleSet', size: 130, filter: specs.ruleSetKey, filterPinned: 1, cell: r => <Button type="button" variant="link" size="sm" aria-label={`${r.ruleSetKey} RuleSet 이력`} onClick={() => setPage({ ruleSetKey: r.ruleSetKey, ruleKey: null })}>{r.ruleSetKey}</Button> },
    { id: 'ruleKey', header: 'Rule', size: 110, cell: r => <Button type="button" variant="link" size="sm" aria-label={`${r.ruleKey} 상세 보기`} onClick={() => setPage({ ruleSetKey: r.ruleSetKey, ruleKey: r.ruleKey })}>{r.ruleKey}</Button> },
    { id: 'title', header: '짧은 이름', size: 180, cell: r => <span className="break-keep whitespace-normal">{r.title}</span> },
    { id: 'support', header: '지원', size: 100, filter: specs.support, filterPinned: 2, cell: r => <SupportBadge value={r.support} />, exportValue: r => r.support },
    { id: 'scopeSummary', header: '지원 범위 요약', size: 180, sortable: false, cell: r => <Original>{scopeSummary(r.scope)}</Original>, exportValue: r => scopeSummary(r.scope) },
    { id: 'targetCount', header: '선언한 대상 범위', size: 250, cell: r => r.firstTarget ? <div className="min-w-0"><Original>{r.firstTarget.format} · {r.firstTarget.target}</Original>{r.targetCount > 1 && <span className="text-xs text-text-muted">외 {r.targetCount - 1}개</span>}</div> : '선언 없음', exportValue: r => r.firstTarget ? `${r.firstTarget.format} · ${r.firstTarget.target} (총 ${r.targetCount})` : '선언 없음' },
    { id: 'requirementIdCount', header: '요구사항 ID 수', size: 110, align: 'right' },
    { id: 'revision', header: 'Revision', size: 90, cell: r => <Original>{r.revision}</Original> },
  ], [specs, setPage]);
  const fields = useMemo<TableFilterField[]>(() => (['scope', 'requirementIds'] as const).map((id, i) => ({ id, label: { ko: FIELD_LABELS[id], en: FIELD_LABELS[id] }, spec: specs[id]!, pinned: id === 'requirementIds' ? 3 : false, order: i })), [specs]);
  const search = <div className="flex min-w-0 flex-wrap items-center gap-2"><CommittedSearch pageKey="q" placeholder="Rule·이름·요약 검색" /><CommittedSearch pageKey="targetQ" placeholder="대상 범위 원문 검색" /></div>;
  if (url.invalid) return <TableUrlWarning search={search} sentences={url.sentences} recoverKeys={url.recoverKeys} cause={url.cause} />;
  return <SnapshotTable<RuleRow> title="규칙 카탈로그" ariaLabel="규칙 카탈로그" columns={columns} getRowId={r => JSON.stringify([r.ruleSetKey, r.ruleKey])}
    preferenceKey="log-rules:v1" filterKey={JSON.stringify([q, targetQ])} pageSize={50} urlState={url.urlState} filterFields={fields}
    activeRowId={pageParam('ruleKey') ? JSON.stringify([pageParam('ruleSetKey'), pageParam('ruleKey')]) : null}
    loadPage={async (query, signal) => {
      const response = await rules.fetch({ q, targetQ, page: query.page, pageSize: query.pageSize, sorting: query.sorting, filters: query.filters }, signal);
      return response.outcome === 'ok' && response.data?.total === 0 ? { ...response, outcome: 'empty' as const } : response;
    }} search={search} />;
}
