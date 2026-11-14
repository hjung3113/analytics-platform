import { formatText, useMessages, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { ADMIN_MESSAGES } from '../messages';
import { useMemo } from 'react';
import { formatInstant, type AuditEvent, type ColumnFilter } from '@ap/contracts';
import { Minus, ArrowRight } from 'lucide-react';
import { useClearFiltersAction, useTableFilterDeclaration, type TableFilterDeclaration, ManagementLayout, RowAction, type PlatformColumn, PlatformDataTable, PlatformPage, TableUrlWarning, useTableUrlState } from '@ap/components';
import { StatusBadge } from '@ap/ui';
import { auditDestination } from '../audit-destination';
import { ACTION_LABEL, SORT_FIELDS, SOURCE_LABEL, TYPE_LABEL } from '../audit-query';
import { AUDIT_PINNED, auditFilterSpecs, auditTimeEntry, auditValueCheck, toAuditQuery } from '../audit-filters';
import { viewerTimeZone } from '../audit-window';

const NO_FILTERS: ColumnFilter[] = [];

// #1690: an API token row names the scopes it was issued or revoked with; every other row lists the changed field names.
function changedFields(row: AuditEvent, lang: 'ko' | 'en'): string {
  if (!row.changes) return '—';
  const scopes = row.target.type === 'api_token' ? row.changes.scopes : undefined;
  if (scopes) return `${formatText(ADMIN_MESSAGES.auditTrailScopes, lang)}: ${scopes[1] ?? scopes[0] ?? ''}`;
  return Object.keys(row.changes).sort().join(', ');
}

const mono = (value: unknown) => <span className="t-mono">{String(value)}</span>;

/**
 * 변경 감사 (issue #50, 06 §12.3 management list). The console's index over the shared audit store: the
 * table is the index, the destination's own AuditTimeline is the detail, and a row links out with resolveLink
 * instead of opening a second timeline in a drawer. Server-side sort/page (offset, not cursor), the client
 * never re-sorts a page; the default sort is the server's newest-first and no URL key is written for it.
 */
export default function AuditTrail() {
  const m = useMessages(ADMIN_MESSAGES);
  const { lang } = useI18n();
  const timeZone = viewerTimeZone();
  const { adapter, resolveLink } = usePlatform();
  // ADR-0105: every condition is one hidden repeated page key `filter`. A bad sort/page/condition is the table warning, which clears exactly the bad keys.
  const filterDeclarations = useMemo<TableFilterDeclaration[]>(() => {
    const specs = auditFilterSpecs(lang);
    return [
      { id: 'at', label: ADMIN_MESSAGES.auditTrailAt, spec: specs.at, entry: auditTimeEntry(timeZone) },
      { id: 'actor', label: ADMIN_MESSAGES.auditTrailActor, spec: specs.actor, pinned: AUDIT_PINNED.actor },
      { id: 'action', label: ADMIN_MESSAGES.auditTrailAction, spec: specs.action, pinned: AUDIT_PINNED.action },
      { id: 'source', label: ADMIN_MESSAGES.auditTrailSource, spec: specs.source },
      { id: 'targetType', label: ADMIN_MESSAGES.auditTrailTargetType, spec: specs.targetType },
      { id: 'targetId', label: ADMIN_MESSAGES.auditTrailTargetID, spec: specs.targetId },
    ];
  }, [lang, timeZone]);
  const { urlFilters, filterColumnProps } = useTableFilterDeclaration('filter', filterDeclarations, { lang, validate: auditValueCheck });
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(SORT_FIELDS, { filters: urlFilters });
  const conditions = urlState?.filters ?? NO_FILTERS;
  const clearButton = useClearFiltersAction({ filterKey: urlFilters.key, hasFilters: conditions.length > 0 });
  const columns = useMemo<PlatformColumn<AuditEvent>[]>(() => [
    { ...filterColumnProps('at'), size: 150, cell: row => <span className="tabular">{formatInstant(row.at, lang, timeZone)}</span> },
    { ...filterColumnProps('actor'), size: 130, cell: row => mono(row.actor) },
    { ...filterColumnProps('action'), size: 110, cell: row => ACTION_LABEL[row.action][lang] },
    { ...filterColumnProps('source'), size: 100, cell: row => <StatusBadge tone={row.source === 'system' ? 'neutral' : 'info'}>{SOURCE_LABEL[row.source][lang]}</StatusBadge> },
    { ...filterColumnProps('targetType'), value: row => row.target.type, size: 110, cell: row => Object.hasOwn(TYPE_LABEL, row.target.type) ? TYPE_LABEL[row.target.type][lang] : mono(row.target.type) },
    { ...filterColumnProps('targetId'), sortable: false, value: row => row.target.id, size: 170, cell: row => mono(row.target.id) },
    { id: 'scopeId', header: m('auditTrailSite'), sortable: false, size: 90, cell: row => row.target.scopeId ?? '—' },
    { id: 'changes', header: m('auditTrailChangedFields'), sortable: false, size: 220, cell: row => changedFields(row, lang) },
    { id: 'reason', header: m('auditTrailReason'), sortable: false, size: 200, cell: row => row.reason ? <span className="block truncate" title={row.reason}>{row.reason}</span> : '—' },
  ], [m, lang, timeZone, filterColumnProps]);
  return <PlatformPage description={m('auditTrailMasterChangeLogAcrossAllSitesRow')}>
    <ManagementLayout
      table={invalid ? <TableUrlWarning sentences={sentences} recoverKeys={recoverKeys} cause={cause} /> :
    <PlatformDataTable<AuditEvent>
        // #1167 B-1: the page head already shows this title; keep it for the outline only, the table's name is ariaLabel.
        title={m('auditTrailAuditTrail')}
        hideTitle
        ariaLabel={m('auditTrailAuditTrailList')}
        subtitle={m('auditTrailDefaultSortIsNewestFirstNoRoom')}
        columns={columns} getRowId={row => row.id}
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
        emptyAction={clearButton}
        rowAction={(row, { compact }) => {
          const link = auditDestination(resolveLink, row.target);
          const name = m('auditTrailDetail', { id: row.target.id });
          if (link.ok) return <RowAction compact={compact} icon={ArrowRight} label={name} text={m('auditTrailDetail2')} link={<PlatformLink href={link.href} />} />;
          const none = m('auditTrailNoDetailPage');
          return <span className={compact ? 'flex size-8 items-center justify-center text-text-muted' : 'text-xs text-text-muted'} title={m('auditTrailNoDetailScreenForThisTarget')}>
            {compact ? <><Minus className="size-4" aria-hidden /><span className="sr-only">{none}</span></> : none}
          </span>;
        }}
      />} />
  </PlatformPage>;
}
