// THROWAWAY #156 — never merge.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { formatInstant, type AuditEvent, type AuditSortField } from '@ap/contracts';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { ManagementLayout, PageFilterBar, type PlatformColumn, PlatformDataTable, PlatformPage, encodeTableSort } from '@ap/components';
import { Button, StatusBadge, usePrototype } from '@ap/ui';
import { auditDestination } from '../audit-destination';
import { ACTION_LABEL, AUDIT_PAGE_KEYS, parseAuditKeys } from '../audit-query';

const mono = (value: unknown) => <span className="t-mono">{String(value)}</span>;

/**
 * 변경 감사 (issue #50, 06 §12.3 management list). The console's index over the shared audit store: the
 * table is the index, the destination's own AuditTimeline is the detail, and a row links out with linkTo
 * instead of opening a second timeline in a drawer. Server-side sort/page (offset, not cursor), the client
 * never re-sorts a page; the default sort is the server's newest-first and no URL key is written for it.
 */
export default function AuditTrail() {
  const variant = usePrototype().management;
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, global, linkTo, pageParam, setPage } = usePlatform();
  const raw = {
    type: pageParam('type'), actor: pageParam('actor'), action: pageParam('action'), source: pageParam('source'),
    fromAt: pageParam('fromAt'), toAt: pageParam('toAt'), targetId: pageParam('targetId'),
    sort: pageParam('sort'), page: pageParam('page'),
  };
  // §6.1 page keys: an invalid wire value alerts instead of substituting, and no adapter call is made.
  const parsed = parseAuditKeys(raw);
  const filterKey = JSON.stringify(parsed.ok ? parsed.filters : null);
  // Every filter change returns to page 1 in the same setPage call — the table does not reset a controlled page.
  const setFilter = (key: string, value: string | null) => setPage({ [key]: value, page: null });
  const [drafts, setDrafts] = useState(() => ({
    actor: raw.actor ?? '', targetId: raw.targetId ?? '', fromAt: raw.fromAt ?? '', toAt: raw.toAt ?? '',
  }));
  useEffect(() => {
    setDrafts({ actor: raw.actor ?? '', targetId: raw.targetId ?? '', fromAt: raw.fromAt ?? '', toAt: raw.toAt ?? '' });
  }, [raw.actor, raw.targetId, raw.fromAt, raw.toAt]);
  const setDraft = (key: keyof typeof drafts, value: string) => setDrafts(current => ({ ...current, [key]: value }));
  const applyDrafts = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage({
      actor: drafts.actor || null,
      targetId: drafts.targetId || null,
      fromAt: drafts.fromAt || null,
      toAt: drafts.toAt || null,
      page: null,
    });
  };
  const clearFilters = () => {
    setDrafts({ actor: '', targetId: '', fromAt: '', toAt: '' });
    setPage(Object.fromEntries(AUDIT_PAGE_KEYS.map(k => [k, null])));
  };
  const clear = <Button type="button" size="sm" variant="secondary" onClick={clearFilters}>{ko ? '필터 초기화' : 'Clear filters'}</Button>;
  const filters = <form onSubmit={applyDrafts}>
    <PageFilterBar orientation={variant === 'C' ? 'column' : 'row'} label={ko ? '감사 필터' : 'Audit filters'} fields={[
      { kind: 'select', key: 'type', label: ko ? '대상 유형' : 'Type', value: raw.type ?? '', emptyOptionLabel: ko ? '전체' : 'All', options: [{ value: 'equipment', label: 'equipment' }, { value: 'metric', label: 'metric' }], onValueChange: value => setFilter('type', value || null) },
      { kind: 'select', key: 'action', label: ko ? '작업' : 'Action', value: raw.action ?? '', emptyOptionLabel: ko ? '전체' : 'All', options: Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label: label[lang] })), onValueChange: value => setFilter('action', value || null) },
      { kind: 'select', key: 'source', label: ko ? '출처' : 'Source', value: raw.source ?? '', emptyOptionLabel: ko ? '전체' : 'All', options: [{ value: 'user', label: 'user' }, { value: 'system', label: 'system' }], onValueChange: value => setFilter('source', value || null) },
      { kind: 'text', key: 'actor', label: ko ? '행위자 정확 일치' : 'Exact actor', value: drafts.actor, onValueChange: value => setDraft('actor', value) },
      { kind: 'text', key: 'targetId', label: ko ? '대상 ID 정확 일치' : 'Exact target id', value: drafts.targetId, onValueChange: value => setDraft('targetId', value) },
      { kind: 'text', key: 'fromAt', label: ko ? '시각 이상 (ISO 시점)' : 'From instant', value: drafts.fromAt, placeholder: '2026-09-26T02:00:00.000Z', onValueChange: value => setDraft('fromAt', value) },
      { kind: 'text', key: 'toAt', label: ko ? '시각 미만 (ISO 시점)' : 'To instant', value: drafts.toAt, placeholder: '2026-09-26T02:00:00.000Z', onValueChange: value => setDraft('toAt', value) },
    ]} actions={<><Button type="submit" size="sm" variant="secondary">{ko ? '적용' : 'Apply'}</Button>{parsed.ok && clear}</>} />
  </form>;
  const columns = useMemo<PlatformColumn<AuditEvent>[]>(() => [
    { id: 'at', header: ko ? '시각' : 'At', size: 150, cell: row => <span className="tabular">{formatInstant(row.at, lang)}</span> },
    { id: 'actor', header: ko ? '행위자' : 'Actor', size: 130, cell: row => mono(row.actor) },
    { id: 'action', header: ko ? '작업' : 'Action', size: 110, cell: row => ACTION_LABEL[row.action][lang] },
    { id: 'source', header: ko ? '출처' : 'Source', size: 100, cell: row => <StatusBadge tone={row.source === 'system' ? 'neutral' : 'info'}>{row.source}</StatusBadge> },
    { id: 'targetType', header: ko ? '대상 유형' : 'Target type', value: row => row.target.type, size: 110, cell: row => mono(row.target.type) },
    { id: 'targetId', header: 'target id', sortable: false, value: row => row.target.id, size: 170, cell: row => mono(row.target.id) },
    { id: 'scopeId', header: ko ? '사이트' : 'Site', sortable: false, size: 90, cell: row => row.target.scopeId ?? '—' },
    { id: 'changes', header: ko ? '변경 필드' : 'Changed fields', sortable: false, size: 220, cell: row => row.changes ? Object.keys(row.changes).sort().join(', ') : '—' },
  ], [ko, lang]);
  if (variant !== 'A') return <PlatformPage description={ko ? '모든 사이트의 마스터 변경 로그입니다. 행의 링크는 각 상세 화면의 Audit 탭으로 이동합니다.' : 'The master-change log across all sites. A row link opens the destination detail\'s Audit tab.'}>
    <ManagementLayout filter={filters} activeFilterCount={[raw.type, raw.actor, raw.action, raw.source, raw.fromAt, raw.toAt, raw.targetId].filter(Boolean).length} table={(filterInTable: ReactNode | undefined) => <>
    {!parsed.ok && filterInTable}
    {!parsed.ok && <p role="alert">{ko ? '필터 값이 잘못되었습니다.' : 'Invalid filter value.'} {clear}</p>}
    {parsed.ok && <PlatformDataTable<AuditEvent>
        filters={filterInTable}
        title={ko ? '변경 감사' : 'Audit trail'}
        ariaLabel={ko ? '변경 감사 목록' : 'Audit trail list'}
        subtitle={ko ? '합성 감사 이벤트입니다. 기본 정렬은 최신순이며 room 필터를 적용하지 않습니다.' : 'Synthetic audit events. Default sort is newest first; no room filter is applied.'}
        columns={columns} getRowId={row => row.id} filterKey={filterKey}
        preferenceKey="admin-audit:columns:v1" pageSize={25} height={430}
        urlState={{
          page: parsed.page,
          sorting: parsed.sorting,
          onChange: ({ page, sorting }) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }),
        }}
        loadPage={async (pageQuery, signal) => {
          const { filters } = parsed;
          const sort = pageQuery.sorting[0];
          // The port answers AuditTrailPage { items, total }; the table wants PageResult { rows, total }.
          const response = await adapter.auditTrail({
            ...(filters.type && { type: filters.type }),
            ...(filters.actor && { actor: filters.actor }),
            ...(filters.action && { action: filters.action }),
            ...(filters.source && { source: filters.source }),
            ...(filters.fromAt && { fromAt: filters.fromAt }),
            ...(filters.toAt && { toAt: filters.toAt }),
            ...(filters.targetId && { targetId: filters.targetId }),
            ...(sort && { sort: { field: sort.id as AuditSortField, desc: sort.desc } }),
            page: pageQuery.page + 1,
            pageSize: 25,
          }, signal);
          return {
            outcome: response.outcome,
            data: response.data === null ? null : { rows: [...response.data.items], total: response.data.total },
            assessments: response.assessments,
            trust: response.trust,
            correlationId: response.correlationId,
            ...(response.message !== undefined && { message: response.message }),
          };
        }}
        emptyAction={clear}
        rowAction={row => {
          const link = auditDestination(linkTo, row.target);
          return link.ok
            ? <Button asChild size="sm" variant="ghost"><PlatformLink href={link.href}>{ko ? '상세' : 'Detail'}</PlatformLink></Button>
            : <Button size="sm" variant="ghost" disabled>{ko ? '이 대상의 상세 화면이 없습니다.' : 'No detail screen for this target.'}</Button>;
        }}
      />}
    </>} />
  </PlatformPage>;
  return <PlatformPage description={ko ? '모든 사이트의 마스터 변경 로그입니다. 행의 링크는 각 상세 화면의 Audit 탭으로 이동합니다.' : 'The master-change log across all sites. A row link opens the destination detail\'s Audit tab.'}>
    {filters}
    {!parsed.ok && <p role="alert">{ko ? '필터 값이 잘못되었습니다.' : 'Invalid filter value.'} {clear}</p>}
    {parsed.ok && <PlatformDataTable<AuditEvent>
        title={ko ? '변경 감사' : 'Audit trail'}
        ariaLabel={ko ? '변경 감사 목록' : 'Audit trail list'}
        subtitle={ko ? '합성 감사 이벤트입니다. 기본 정렬은 최신순이며 room 필터를 적용하지 않습니다.' : 'Synthetic audit events. Default sort is newest first; no room filter is applied.'}
        columns={columns} getRowId={row => row.id} filterKey={filterKey}
        preferenceKey="admin-audit:columns:v1" pageSize={25} height={430}
        urlState={{
          page: parsed.page,
          sorting: parsed.sorting,
          onChange: ({ page, sorting }) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }),
        }}
        loadPage={async (pageQuery, signal) => {
          const { filters } = parsed;
          const sort = pageQuery.sorting[0];
          // The port answers AuditTrailPage { items, total }; the table wants PageResult { rows, total }.
          const response = await adapter.auditTrail({
            ...(filters.type && { type: filters.type }),
            ...(filters.actor && { actor: filters.actor }),
            ...(filters.action && { action: filters.action }),
            ...(filters.source && { source: filters.source }),
            ...(filters.fromAt && { fromAt: filters.fromAt }),
            ...(filters.toAt && { toAt: filters.toAt }),
            ...(filters.targetId && { targetId: filters.targetId }),
            ...(sort && { sort: { field: sort.id as AuditSortField, desc: sort.desc } }),
            page: pageQuery.page + 1,
            pageSize: 25,
          }, signal);
          return {
            outcome: response.outcome,
            data: response.data === null ? null : { rows: [...response.data.items], total: response.data.total },
            assessments: response.assessments,
            trust: response.trust,
            correlationId: response.correlationId,
            ...(response.message !== undefined && { message: response.message }),
          };
        }}
        emptyAction={clear}
        rowAction={row => {
          const link = auditDestination(linkTo, row.target);
          return link.ok
            ? <Button asChild size="sm" variant="ghost"><PlatformLink href={link.href}>{ko ? '상세' : 'Detail'}</PlatformLink></Button>
            : <Button size="sm" variant="ghost" disabled>{ko ? '이 대상의 상세 화면이 없습니다.' : 'No detail screen for this target.'}</Button>;
        }}
      />}
  </PlatformPage>;
}
