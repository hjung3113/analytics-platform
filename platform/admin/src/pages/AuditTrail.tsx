import { formatListTime, useMessages, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { ADMIN_MESSAGES } from '../messages';
import { useMemo } from 'react';
import { type AuditEvent, type ColumnFilter } from '@ap/contracts';
import { Minus, ArrowRight } from 'lucide-react';
import { useClearFiltersAction, useTableFilterDeclaration, type TableFilterDeclaration, ManagementLayout, RowAction, type PlatformColumn, PlatformDataTable, PlatformPage, TableUrlWarning, useTableUrlState } from '@ap/components';
import { Button, Popover, PopoverContent, PopoverTrigger, StatusBadge } from '@ap/ui';
import { auditDestination } from '../audit-destination';
import { auditActionLabel, auditTypeLabel, SORT_FIELDS, SOURCE_LABEL, TYPE_LABEL } from '../audit-query';
import { AUDIT_PINNED, auditFilterSpecs, auditTimeEntry, auditValueCheck, toAuditQuery } from '../audit-filters';
import { viewerTimeZone } from '../audit-window';

const NO_FILTERS: ColumnFilter[] = [];

function displayChoices(rows: readonly AuditEvent[], read: (row: AuditEvent) => { value: string; label?: string; context?: string | null }) {
  const names = new Map<string, { label: string; context?: string | null }>();
  for (const row of rows) {
    const { value, label, context } = read(row);
    if (label?.trim() && !names.has(value)) names.set(value, { label: label.trim(), context });
  }
  const choices = [...names].map(([value, name]) => ({ value, ...name }));
  const options = choices.map(({ value, label, context }) => {
    const sameName = choices.filter(choice => choice.label === label);
    if (sameName.length === 1) return { value, label };
    const distinctContext = context && sameName.filter(choice => choice.context === context).length === 1;
    return { value, label: `${label} · ${distinctContext ? context : value}` };
  });
  return { exactId: true, options };
}

function AuditOriginal({ event }: { event: AuditEvent }) {
  const m = useMessages(ADMIN_MESSAGES);
  const original = { actor: event.actor, type: event.target.type, targetId: event.target.id, scopeId: event.target.scopeId, changes: event.changes };
  return <Popover>
    <PopoverTrigger asChild><Button variant="ghost" size="toolbar">{m('auditTrailOriginal')}</Button></PopoverTrigger>
    <PopoverContent align="end" aria-label={m('auditTrailOriginal')}>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all t-mono text-xs">{JSON.stringify(original, null, 2)}</pre>
    </PopoverContent>
  </Popover>;
}

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
  const selectedType = conditions.find(condition => condition.id === 'targetType' && condition.op === 'equals');
  const targetType = selectedType?.op === 'equals' ? selectedType.value : undefined;
  const columns = useMemo<PlatformColumn<AuditEvent>[]>(() => [
    { ...filterColumnProps('at'), size: 125, cell: row => <time dateTime={row.at} className="tabular">{formatListTime(row.at, { timeZone })}</time> },
    { ...filterColumnProps('actor'), size: 120, isCellEmpty: row => !row.actorLabel?.trim(),
      filterChoices: rows => displayChoices(rows, row => ({ value: row.actor, label: row.actorLabel, context: SOURCE_LABEL[row.source][lang] })),
      cell: row => row.actorLabel?.trim() || m('auditTrailUnknownActor') },
    { ...filterColumnProps('action'), size: 120, cell: row => auditActionLabel(row)[lang] },
    { ...filterColumnProps('source'), size: 120, cellKind: 'badge', cell: row => <StatusBadge tone={row.source === 'system' ? 'neutral' : 'info'}>{SOURCE_LABEL[row.source][lang]}</StatusBadge> },
    { ...filterColumnProps('targetType'), value: row => row.target.type, size: 148,
      filterChoices: () => ({ options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label: label[lang] })), fallbackLabel: m('auditTrailUnknownType') }),
      cell: row => auditTypeLabel(row.target.type)[lang] },
    { ...filterColumnProps('targetId'), sortable: false, value: row => row.target.id, size: 124,
      filterChoices: rows => displayChoices(rows.filter(row => row.target.type === targetType), row => ({
        value: row.target.id, label: row.target.label, context: row.target.scopeId,
      })),
      cell: row => row.target.label?.trim() || <span className="text-text-muted">{auditTypeLabel(row.target.type)[lang]}</span> },
    { id: 'changes', header: m('auditTrailChangedFields'), sortable: false, size: 126,
      cell: row => row.changes ? m('auditTrailChangeCount', { count: String(Object.keys(row.changes).length) }) : '—' },
    { id: 'original', header: m('auditTrailOriginal'), sortable: false, size: 125, cell: row => <AuditOriginal event={row} /> },
    { id: 'reason', header: m('auditTrailReason'), sortable: false, size: 200, cellKind: 'longText',
      isCellEmpty: row => !row.reason, cell: () => '—' },
  ], [m, lang, timeZone, filterColumnProps, targetType]);
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
          const response = await adapter.auditTrail({ ...toAuditQuery(pageQuery.filters ?? NO_FILTERS, { page: pageQuery.page + 1, pageSize: 25, sorting: pageQuery.sorting }), includeLabels: true }, signal);
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
          const name = m('auditTrailDetail', { id: row.target.label?.trim() || auditTypeLabel(row.target.type)[lang] });
          if (link.ok) return <RowAction compact={compact} icon={ArrowRight} label={name} text={m('auditTrailDetail2')} link={<PlatformLink href={link.href} />} />;
          const none = m('auditTrailNoDetailPage');
          return <span className={compact ? 'flex size-8 items-center justify-center text-text-muted' : 'text-xs text-text-muted'} title={m('auditTrailNoDetailScreenForThisTarget')}>
            {compact ? <><Minus className="size-4" aria-hidden /><span className="sr-only">{none}</span></> : none}
          </span>;
        }}
      />} />
  </PlatformPage>;
}
