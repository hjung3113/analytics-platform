import { parseFilterParams, type ColumnFilter, type ColumnFilterSpec } from '@ap/contracts';
import { useMemo, useState } from 'react';
import { useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { TableUrlWarning, useTableUrlState, type PlatformColumn, type TableFilterField, type FilterValueCheck } from '@ap/components';
import { Button, Input } from '@ap/ui';
import { RULE_SORT_IDS, SUPPORTS, ruleFilterSpecs, rulesEndpoint, ruleSetsEndpoint, type RuleRow } from '../endpoints';
import { Original, ScopeText, scopeSummary, SupportBadge } from './presentation';
import { SnapshotTable } from './SnapshotTable';
import { usePageWriter } from './usePageWriter';

const FIELD_LABELS = { ruleSetKey: 'RuleSet', support: '지원', scope: '지원 범위', requirementIds: '요구사항 ID', targetCount: '대상 범위 원문' };
const unsafe = (value: string) => value.includes('\u0000') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
const validate: FilterValueCheck = filter => {
  if (filter.op === 'in' || filter.op === 'notIn') {
    if (filter.id === 'support' && !filter.value.every(value => (SUPPORTS as readonly string[]).includes(value))) return { ko: '지원 값이 올바르지 않습니다.', en: 'Invalid support value.' };
    if (filter.id === 'ruleSetKey' && !filter.value.every(value => value.trim() !== '' && value.length <= 200 && !unsafe(value))) return { ko: 'RuleSet은 200자 이하의 비어 있지 않은 값이어야 합니다.', en: 'RuleSet must be nonblank text of at most 200 characters.' };
  }
  if (filter.id === 'targetCount' && filter.op === 'contains' && (filter.value.length > 200 || unsafe(filter.value))) return { ko: '대상 범위 원문은 200자 이하로 입력해 주세요.', en: 'Target text must be at most 200 characters.' };
  return null;
};
/** Only the server's declared filters travel in filters; target text has its own existing parameter. */
export function ruleRequestFilters(filters: ColumnFilter[]) {
  const target = filters.find(filter => filter.id === 'targetCount');
  return { targetQ: target?.op === 'contains' ? target.value : null, filters: filters.filter(filter => filter.id !== 'targetCount') };
}
export function CommittedSearch({ pageKey, placeholder }: { pageKey: string; placeholder: string }) {
  const { pageParam, setPage } = usePlatform();
  const q = pageParam(pageKey) ?? '';
  const [draft, setDraft] = useState({ applied: q, text: q });
  if (draft.applied !== q) setDraft({ applied: q, text: q });
  const commit = () => setPage({ [pageKey]: draft.text.trim() || null, page: null });
  return <Input type="search" inputSize="toolbar" placeholder={placeholder} aria-label={placeholder} value={draft.text}
    onChange={event => setDraft({ applied: q, text: event.target.value })} onBlur={commit} onKeyDown={event => {
      if (event.defaultPrevented) return;
      if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) commit();
      if (event.key === 'Escape' && draft.text !== '') { event.preventDefault(); setDraft({ applied: q, text: '' }); }
    }} />;
}
export function RulesTable({ onOpen }: { onOpen: () => void }) {
  const { pageParam, pageParams } = usePlatform();
  const setPage = usePageWriter();
  const q = pageParam('q');
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
  const filters = useMemo(() => ({ key: 'filter', specs, labels: FIELD_LABELS, validate }), [specs]);
  const url = useTableUrlState(RULE_SORT_IDS, { filters });
  const columns = useMemo<PlatformColumn<RuleRow>[]>(() => [
    { id: 'ruleSetKey', header: 'RuleSet', size: 130, filter: specs.ruleSetKey, filterPinned: 1, cell: r => <Button type="button" variant="link" size="sm" aria-label={`${r.ruleSetKey} RuleSet 이력`} onClick={() => { onOpen(); setPage({ ruleSetKey: r.ruleSetKey, ruleKey: null }); }}>{r.ruleSetKey}</Button> },
    { id: 'ruleKey', header: 'Rule', size: 110, cell: r => <Button type="button" variant="link" size="sm" aria-label={`${r.ruleKey} 상세 보기`} onClick={() => { onOpen(); setPage({ ruleSetKey: r.ruleSetKey, ruleKey: r.ruleKey }); }}>{r.ruleKey}</Button> },
    { id: 'title', header: '짧은 이름', size: 180, cell: r => <span className="block truncate break-keep">{r.title}</span> },
    { id: 'support', header: '지원', size: 100, filter: specs.support, filterPinned: 2, cell: r => <SupportBadge value={r.support} />, exportValue: r => r.support },
    { id: 'scopeSummary', header: '지원 범위 요약', size: 180, sortable: false, cell: r => <ScopeText scope={r.scope} summary />, exportValue: r => scopeSummary(r.scope) },
    { id: 'targetCount', header: '선언한 대상 범위', size: 250, filter: specs.targetCount, filterPinned: 4, filterLabel: '대상 범위 원문', cell: r => r.firstTarget ? <span className="t-mono block truncate">{r.firstTarget.format} · {r.firstTarget.target}{r.targetCount > 1 ? ` · 외 ${r.targetCount - 1}개` : ''}</span> : '선언 없음', exportValue: r => r.firstTarget ? `${r.firstTarget.format} · ${r.firstTarget.target} (총 ${r.targetCount})` : '선언 없음' },
    { id: 'requirementIdCount', header: '요구사항 ID 수', size: 110, align: 'right' },
    { id: 'revision', header: 'Revision', size: 90, cell: r => <Original>{r.revision}</Original> },
  ], [specs, setPage, onOpen]);
  const fields = useMemo<TableFilterField[]>(() => (['scope', 'requirementIds'] as const).map((id, i) => ({ id, label: { ko: FIELD_LABELS[id], en: FIELD_LABELS[id] }, spec: specs[id]!, pinned: id === 'requirementIds' ? 3 : false, order: i })), [specs]);
  const search = <CommittedSearch pageKey="q" placeholder="Rule·이름·요약 검색" />;
  if (url.invalid) return <TableUrlWarning search={search} sentences={url.sentences} recoverKeys={url.recoverKeys} cause={url.cause} />;
  return <SnapshotTable<RuleRow> title="규칙 카탈로그" ariaLabel="규칙 카탈로그" columns={columns} getRowId={r => JSON.stringify([r.ruleSetKey, r.ruleKey])}
    preferenceKey="log-rules:v1" filterKey={JSON.stringify([q])} pageSize={50} urlState={url.urlState} filterFields={fields}
    activeRowId={pageParam('ruleKey') ? JSON.stringify([pageParam('ruleSetKey'), pageParam('ruleKey')]) : null}
    loadPage={async (query, signal) => {
      const response = await rules.fetch({ q, page: query.page, pageSize: query.pageSize, sorting: query.sorting, ...ruleRequestFilters(query.filters ?? []) }, signal);
      return response.outcome === 'ok' && response.data?.total === 0 ? { ...response, outcome: 'empty' as const } : response;
    }} search={search} emptyAction={<Button type="button" variant="secondary" size="toolbar" onClick={() => setPage({ q: null, filter: null, page: null })}>필터 지우기</Button>} />;
}
