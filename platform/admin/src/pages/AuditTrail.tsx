import { useMemo } from 'react';
import { formatInstant, type AuditEvent, type ColumnFilter } from '@ap/contracts';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { Minus, ArrowRight } from 'lucide-react';
import { ManagementLayout, RowAction, type PlatformColumn, PlatformDataTable, PlatformPage, TableUrlWarning, useTableUrlState } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { auditDestination } from '../audit-destination';
import { ACTION_LABEL, SORT_FIELDS, SOURCE_LABEL, TYPE_LABEL } from '../audit-query';
import { AUDIT_LEGACY_KEYS, AUDIT_PINNED, auditFilterSpecs, auditTimeEntry, auditValueCheck, toAuditQuery } from '../audit-filters';
import { viewerTimeZone } from '../audit-window';

const NO_FILTERS: ColumnFilter[] = [];

const mono = (value: unknown) => <span className="t-mono">{String(value)}</span>;

/**
 * 변경 감사 (issue #50, 06 §12.3 management list). The console's index over the shared audit store: the
 * table is the index, the destination's own AuditTimeline is the detail, and a row links out with linkTo
 * instead of opening a second timeline in a drawer. Server-side sort/page (offset, not cursor), the client
 * never re-sorts a page; the default sort is the server's newest-first and no URL key is written for it.
 */
export default function AuditTrail() {
  const { t, lang } = useI18n();
  const ko = lang === 'ko';
  const timeZone = viewerTimeZone();
  const { adapter, linkTo, setPage } = usePlatform();
  // ADR-0105: every condition is one hidden repeated page key `filter`; the old single keys (`actor`, `type`, `fromAt`, ...) are read for one
  // release and rewritten (replace) into it. A bad sort/page/condition is the table warning, which clears exactly the bad keys.
  const specs = useMemo(() => auditFilterSpecs(lang), [lang]);
  const urlFilters = useMemo(() => ({
    key: 'filter', specs, legacy: AUDIT_LEGACY_KEYS, validate: auditValueCheck,
    labels: { at: ko ? '시각' : 'At', actor: ko ? '행위자' : 'Actor', action: ko ? '작업' : 'Action', source: ko ? '출처' : 'Source', targetType: ko ? '대상 유형' : 'Target type', targetId: ko ? '대상 ID' : 'Target ID',
      // The old single keys that name a different field than their id (`type` is the 대상 유형 column, `fromAt`/`toAt` the two ends of 시각).
      type: ko ? '대상 유형' : 'Target type', fromAt: ko ? '시각 이후' : 'At or after', toAt: ko ? '시각 미만' : 'Before' },
  }), [specs, ko]);
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(SORT_FIELDS, { filters: urlFilters });
  const conditions = urlState?.filters ?? NO_FILTERS;
  const columns = useMemo<PlatformColumn<AuditEvent>[]>(() => [
    { id: 'at', header: ko ? '시각' : 'At', size: 150, filter: specs.at, filterEntry: auditTimeEntry(timeZone), cell: row => <span className="tabular">{formatInstant(row.at, lang, timeZone)}</span> },
    { id: 'actor', header: ko ? '행위자' : 'Actor', size: 130, filter: specs.actor, filterPinned: AUDIT_PINNED.actor, cell: row => mono(row.actor) },
    { id: 'action', header: ko ? '작업' : 'Action', size: 110, filter: specs.action, filterPinned: AUDIT_PINNED.action, cell: row => ACTION_LABEL[row.action][lang] },
    { id: 'source', header: ko ? '출처' : 'Source', size: 100, filter: specs.source, cell: row => <StatusBadge tone={row.source === 'system' ? 'neutral' : 'info'}>{SOURCE_LABEL[row.source][lang]}</StatusBadge> },
    { id: 'targetType', header: ko ? '대상 유형' : 'Target type', filter: specs.targetType, value: row => row.target.type, size: 110, cell: row => Object.hasOwn(TYPE_LABEL, row.target.type) ? TYPE_LABEL[row.target.type][lang] : mono(row.target.type) },
    { id: 'targetId', header: ko ? '대상 ID' : 'Target ID', sortable: false, filter: specs.targetId, value: row => row.target.id, size: 170, cell: row => mono(row.target.id) },
    { id: 'scopeId', header: ko ? '사이트' : 'Site', sortable: false, size: 90, cell: row => row.target.scopeId ?? '—' },
    { id: 'changes', header: ko ? '변경 필드' : 'Changed fields', sortable: false, size: 220, cell: row => row.changes ? Object.keys(row.changes).sort().join(', ') : '—' },
    { id: 'reason', header: ko ? '사유' : 'Reason', sortable: false, size: 200, cell: row => row.reason ? <span className="block truncate" title={row.reason}>{row.reason}</span> : '—' },
  ], [ko, lang, timeZone, specs]);
  return <PlatformPage description={ko ? '모든 사이트의 마스터 변경 로그입니다. 행의 링크는 각 상세 화면의 변경 이력 탭으로 이동합니다.' : 'The master-change log across all sites. A row link opens the destination detail\'s change-history tab.'}>
    <ManagementLayout
      table={() => invalid ? <TableUrlWarning sentences={sentences} recoverKeys={recoverKeys} cause={cause} /> :
    <PlatformDataTable<AuditEvent>
        // #1167 B-1: the page head already shows this title; keep it for the outline only, the table's name is ariaLabel.
        title={<span className="sr-only">{ko ? '변경 감사' : 'Audit trail'}</span>}
        ariaLabel={ko ? '변경 감사 목록' : 'Audit trail list'}
        subtitle={ko ? '기본 정렬은 최신순이며 room 필터를 적용하지 않습니다.' : 'Default sort is newest first; no room filter is applied.'}
        columns={columns} getRowId={row => row.id} filterKey=""
        preferenceKey="admin-audit:columns:v1" pageSize={25}
        urlState={urlState}
        loadPage={async (pageQuery, signal) => {
          // The port answers AuditTrailPage { items, total }; the table wants PageResult { rows, total }.
          const response = await adapter.auditTrail(toAuditQuery(pageQuery.filters ?? NO_FILTERS, { page: pageQuery.page + 1, pageSize: 25, sorting: pageQuery.sorting }), signal);
          return {
            outcome: response.outcome,
            data: response.data === null ? null : { rows: [...response.data.items], total: response.data.total },
            assessments: response.assessments,
            trust: response.trust,
            correlationId: response.correlationId,
            ...(response.message !== undefined && { message: response.message }),
          };
        }}
        emptyAction={conditions.length > 0 ? <Button type="button" size="sm" variant="secondary" onClick={() => setPage({ filter: null, page: null })}>{t('clearFilters')}</Button> : null}
        rowAction={(row, { compact }) => {
          const link = auditDestination(linkTo, row.target);
          const name = ko ? `${row.target.id} 상세` : `Detail ${row.target.id}`;
          if (link.ok) return <RowAction compact={compact} icon={ArrowRight} label={name} text={ko ? '상세' : 'Detail'} link={<PlatformLink href={link.href} />} />;
          const none = ko ? '상세 화면 없음' : 'No detail page';
          return <span className={compact ? 'flex size-8 items-center justify-center text-text-muted' : 'text-xs text-text-muted'} title={ko ? '이 대상의 상세 화면이 없습니다.' : 'No detail screen for this target.'}>
            {compact ? <><Minus className="size-4" aria-hidden /><span className="sr-only">{none}</span></> : none}
          </span>;
        }}
      />} />
  </PlatformPage>;
}
