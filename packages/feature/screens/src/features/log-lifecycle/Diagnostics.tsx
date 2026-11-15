import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@ap/ui';
import type { Attempt, DiagnosticItem, DiagnosticList, DiagnosticListRow, DiagnosticTable, RoundDetail, ScreenProps } from './contracts';
import { Pager, ReadView, Section } from './presentation';
import { usePageValue } from './usePageValue';
import { diagnosticCopy as copy } from './Diagnostics.messages';

const CELL_PREVIEW_LENGTH = 80;
const TABLE_PAGE_SIZE = 100;
const COLUMN_WIDTHS = { string: 200, number: 120, boolean: 100 };
type Props = ScreenProps & { round: RoundDetail; attempt: Attempt | undefined; ruleLabels: Readonly<Record<string, string>>; onOpenSource?: (order: number, line: number) => void };
type TableRead = { kind: 'initial' } | { kind: 'page'; tableKey: string; rowOffset: number };
type Shape = Pick<DiagnosticListRow, 'itemKey' | 'tableCount' | 'rowCounts' | 'evidenceCount'>;
type DiagnosticStateKind = 'no_permission' | 'erased_retention' | 'erased_admin' | 'empty' | 'no_attempt' | 'incomplete_attempt';

/** One framing for unavailable bodies; all server-provided shape metadata remains visible. */
function DiagnosticState({ state, shape }: { state: DiagnosticStateKind; shape?: Shape }) {
  const titles = { no_permission: copy.no_permission, erased_retention: copy.erased_retention, erased_admin: copy.erased_admin, empty: copy.noItems, no_attempt: copy.noAttempt, incomplete_attempt: copy.incompleteAttempt };
  const reasons: Partial<Record<DiagnosticStateKind, string>> = { no_permission: copy.denied, erased_retention: copy.retained, erased_admin: copy.admin };
  return <div role="status" className="grid min-w-0 gap-2 rounded-md border border-border-subtle bg-surface-card p-3 text-sm text-text-secondary"><p className="flex items-center gap-2 font-semibold"><Info className="size-4" aria-hidden />{titles[state]}</p><div className="grid gap-2">
    {reasons[state] ? <p>{reasons[state]}</p> : null}
    {shape ? <dl aria-label={copy.shape} className="grid gap-1">
      <dt>{copy.key}</dt><dd className="break-all font-mono">{shape.itemKey}</dd>
      <dt>{copy.tables}</dt><dd>{shape.tableCount} · {shape.rowCounts.join('/')} {copy.rows}</dd>
      <dt>{copy.evidence}</dt><dd>{shape.evidenceCount}</dd>
    </dl> : null}
  </div></div>;
}
export function Diagnostics(props: Props) {
  const { attempt } = props;
  const heading = `${copy.attemptDiagnostics}${attempt ? ` · ${copy.attempt} #${attempt.attemptNo}` : ''}`;
  if (!attempt) return <Section title={heading}><DiagnosticState state="no_attempt" /></Section>;
  if (attempt.outcome !== 'succeeded') return <Section title={heading}><DiagnosticState state="incomplete_attempt" /></Section>;
  return <section className="@container flex min-w-0 flex-1 flex-col gap-3"><h2 className="text-sm font-semibold">{heading}</h2><DiagnosticListView key={attempt.id} {...props} attempt={attempt} /></section>;
}
function DiagnosticListView(props: Props & { attempt: Attempt }) {
  const { attempt } = props;
  const [filter, setFilter] = usePageValue(props, 'diagnosticRule', '', ['diagnostic']);
  const [selected, setSelected] = usePageValue(props, 'diagnostic', '', []);
  return <div className="flex min-w-0 flex-col gap-3 @5xl:flex-1">
    {filter ? <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="rounded-md bg-surface-card px-2 py-1 text-sm">{copy.filter} · {props.ruleLabels[filter] ?? filter}</span><Button variant="link" size="toolbar" onClick={() => setFilter('')}>{copy.clearFilter}</Button></div> : null}
    <DiagnosticListPage key={filter} {...props} attempt={attempt} filter={filter} selected={selected} onSelect={setSelected} />
  </div>;
}
function DiagnosticListPage(props: Props & { attempt: Attempt; filter: string; selected: string; onSelect(value: string): void; }) {
  const [listRead, setListRead] = useState({ page: 0, generation: 0 });
  const onPage = useCallback((page: number) => setListRead(previous => ({ page, generation: previous.generation + 1 })), []);
  // Key by generation so returning to an earlier page creates a new read instance rather than replaying a cached key offline.
  return <DiagnosticListReader key={listRead.generation} {...props} page={listRead.page} onPage={onPage} />;
}
function DiagnosticListReader(props: Props & { attempt: Attempt; filter: string; selected: string; onSelect(value: string): void; page: number; onPage(page: number): void }) {
  const { api, ui, attempt, filter, selected, onSelect, page, onPage } = props;
  const [sourceAccess, setSourceAccess] = useState<'from_list' | 'denied'>('from_list');
  const onDenied = useCallback(() => setSourceAccess('denied'), []);
  const query = api.useRead<DiagnosticList>('diagnostics', { attemptId: attempt.id, page, pageSize: 25, ...(filter ? { ruleResultId: filter } : {}) });
  return <ReadView query={query}>{data => {
    // A later detail denial also invalidates Source-derived titles from the already loaded list.
    const denied = sourceAccess === 'denied' || data.access === 'no_permission';
    const rows = data.rows.map(r => ({ ...r, id: `${r.producer}:${r.itemKey}` }));
    // Explicit URL identities are authoritative, even when absent from this page. Only an absent key defaults locally.
    const identity = selected || (!denied ? rows[0]?.id ?? '' : '');
    const selectedRow = rows.find(r => r.id === identity);
    let detail: ReactNode = null;
    if (denied) detail = <DiagnosticState state="no_permission" {...(selectedRow ? { shape: selectedRow } : {})} />;
    else if (identity) detail = <DiagnosticItemView key={identity} {...props} identity={identity} metadata={selectedRow} onDenied={onDenied} />;
    else if (data.documents.length === 0) detail = <DiagnosticState state="empty" />;
    else if (filter) detail = <div role="status" className="grid gap-2 text-sm"><p>{copy.emptyFilter}</p></div>;
    const rowTitle = (row: DiagnosticListRow) => {
      if (denied) return copy.hiddenTitle;
      const fallback = row.bodyState === 'live' ? copy.untitled : copy[row.bodyState];
      return row.title ?? fallback;
    };
    // The page supplies the height budget; the shared grid row stretches both frames. Natural content can grow the
    // row (one shell scroll layer), while a short list leaves its slack inside the frame. Stack to content below 64rem.
    return <div className="flex min-w-0 flex-col @5xl:flex-1">
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 @5xl:flex-1 @5xl:grid-cols-4">
        <div data-testid="diagnostic-list-frame" className="flex min-w-0 flex-col self-stretch rounded-lg border border-border-subtle bg-surface-card">
          {rows.length ? ui.table({ title: copy.list, hideTitle: true, fill: true, embedded: true, preferenceKey: 'log-lifecycle-diagnostic-list', rows, activeRowId: identity, pagination: <Pager page={page} total={data.total} onChange={onPage} />, columns: [{ id: 'title', header: copy.title, sortable: false, cell: r => <div className="grid min-w-0 gap-1 break-keep">
          <Button variant="link" size="toolbar" className="h-auto max-w-full justify-start whitespace-normal text-left" onClick={() => onSelect(r.id)}>{rowTitle(r)}</Button>
          <p className="break-all font-mono text-sm text-text-secondary">{r.producer}</p>
          <p className="text-sm text-text-secondary">{copy[r.origin]} · {copy.tables} {r.tableCount} · {r.rowCounts.join('/')} {copy.rows} · {copy.evidence} {r.evidenceCount} · {copy[r.bodyState]}</p>
          <p className="break-all font-mono text-sm text-text-muted">{r.itemKey}</p>
        </div> }] }) : null}</div>
        <div data-testid="diagnostic-detail-frame" className="grid min-w-0 content-start gap-3 self-stretch rounded-lg border border-border-subtle bg-surface-card p-3 @5xl:col-span-3">
          {detail}
        </div>
      </div>
    </div>;
  }}</ReadView>;
}
function DiagnosticItemView(props: Props & { attempt: Attempt; identity: string; metadata: DiagnosticListRow | undefined; onDenied(): void }) {
  const [itemRead, setItemRead] = useState<{ tableRead: TableRead; generation: number }>({ tableRead: { kind: 'initial' }, generation: 0 });
  const onTableRead = useCallback((tableRead: TableRead) => setItemRead(previous => ({ tableRead, generation: previous.generation + 1 })), []);
  // Key by generation so table paging and returning to all tables each start a fresh read instance.
  return <DiagnosticItemReader key={itemRead.generation} {...props} tableRead={itemRead.tableRead} onTableRead={onTableRead} />;
}
function DiagnosticItemReader(props: Props & { attempt: Attempt; identity: string; metadata: DiagnosticListRow | undefined; tableRead: TableRead; onTableRead(next: TableRead): void; onDenied(): void }) {
  const { api, attempt, identity, metadata, tableRead, onTableRead, onDenied } = props;
  const separator = identity.indexOf(':');
  const producer = identity.slice(0, separator);
  const itemKey = identity.slice(separator + 1);
  const paging = tableRead.kind === 'page' ? { tableKey: tableRead.tableKey, rowOffset: tableRead.rowOffset } : {};
  const query = api.useRead<{ item: DiagnosticItem }>('diagnosticItem', { attemptId: attempt.id, producer, itemKey, ...paging });
  useEffect(() => { if (query.denied) onDenied(); }, [query.denied, onDenied]);
  if (query.denied) return <DiagnosticState state="no_permission" {...(metadata ? { shape: metadata } : {})} />;
  return <ReadView query={query} empty={copy.missing}>{({ item }) => {
    // Never substitute the first row, including for an explicit unknown URL selection.
    if (!item || item.producer !== producer || item.itemKey !== itemKey) return <p role="status" className="text-sm">{copy.missing}</p>;
    const shape: Shape = metadata ?? { itemKey: item.itemKey, tableCount: item.tables.length, rowCounts: item.tables.map(t => t.totalRows), evidenceCount: item.evidenceRefs.length };
    const occurrences = new Map<string, number>();
    const evidenceRows = item.evidenceRefs.map(ref => {
      const location = `${ref.fileRef}:${ref.line}:${ref.fileSha256}`;
      const occurrence = occurrences.get(location) ?? 0;
      occurrences.set(location, occurrence + 1);
      return { ref, key: `${location}:${occurrence}` };
    });
    return <div className="grid min-w-0 grid-cols-1 gap-4 break-keep">
      <div className="grid min-w-0 gap-1"><h3 className="break-words text-sm font-semibold">{item.title ?? copy.untitled}</h3><p className="break-all font-mono text-sm text-text-secondary">{item.producer}</p><p className="break-all font-mono text-sm text-text-muted">{item.itemKey}</p></div>
      {item.origin === 'rule' && item.ruleResultId ? <Button variant="link" size="toolbar" className="justify-self-start" onClick={() => props.setState?.({ view: 'verify', rule: item.ruleResultId ?? undefined, issue: undefined })}>{props.ruleLabels[item.ruleResultId] ?? copy.openRule}</Button> : null}
      {tableRead.kind === 'page' ? <div className="flex flex-wrap items-center gap-2 text-sm"><span className="break-all">{copy.selectedTable} · {tableRead.tableKey}</span><Button variant="link" size="toolbar" onClick={() => onTableRead({ kind: 'initial' })}>{copy.allTables}</Button></div> : null}
      {item.bodyState !== 'live' ? <DiagnosticState state={item.bodyState} shape={shape} /> : <>
        {item.explanation ? <Section title={copy.explanation}><p className="whitespace-pre-wrap break-words text-sm">{item.explanation}</p></Section> : null}
        {item.tables.map(table => <DiagnosticTableView key={table.tableKey} ui={props.ui} table={table} onPage={page => onTableRead({ kind: 'page', tableKey: table.tableKey, rowOffset: page * TABLE_PAGE_SIZE })} />)}
      </>}
      <Section title={copy.evidence}>{item.evidenceRefs.length ? evidenceRows.map(({ ref, key }) => {
        const file = props.round.sampleSet.files.find(f => f.fileRef === ref.fileRef && f.sha256 === ref.fileSha256);
        const available = !!file && !!props.onOpenSource;
        return <div key={key} className="grid min-w-0 gap-1 text-sm"><p className="break-all font-mono">{ref.fileRef}:{ref.line}</p><Button variant="link" size="toolbar" className="justify-self-start" disabled={!available} onClick={() => { if (file) props.onOpenSource?.(file.order, ref.line); }}>{copy.openSource}</Button>{!available ? <p className="text-text-secondary">{props.onOpenSource ? copy.unavailableSource : copy.sourceUnavailable}</p> : null}</div>;
      }) : <p role="status" className="text-sm text-text-secondary">{copy.noEvidence}</p>}</Section>
    </div>;
  }}</ReadView>;
}
function DiagnosticCell({ value }: { value: string | number | boolean | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (typeof value === 'number') return <span className="block w-full text-right font-mono tabular-nums">{value}</span>;
  if (typeof value === 'boolean') return <span>{value ? copy.yes : copy.no}</span>;
  const text = value === null || value === undefined ? '—' : String(value);
  const long = text.length > CELL_PREVIEW_LENGTH;
  return <div className="grid min-w-0 gap-1 text-sm"><span className={expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2 break-words'}>{long && !expanded ? `${text.slice(0, CELL_PREVIEW_LENGTH)}…` : text}</span>{long ? <Button variant="link" size="toolbar" className="justify-self-start" aria-expanded={expanded} onClick={() => setExpanded(old => !old)}>{expanded ? copy.collapse : copy.expand}</Button> : null}</div>;
}
function DiagnosticTableView({ ui, table, onPage }: Pick<ScreenProps, 'ui'> & { table: DiagnosticTable; onPage(page: number): void }) {
  const columns = useMemo(() => table.columns.map(column => ({ id: column.key, header: column.label ?? column.key, sortable: false as const, size: COLUMN_WIDTHS[column.type], ...(column.type === 'number' ? { align: 'right' as const } : {}), cell: (row: { cells: Record<string, string | number | boolean | null> }) => <DiagnosticCell value={row.cells[column.key]} /> })), [table.columns]);
  return <div className="min-w-0 max-w-full overflow-x-auto">{ui.table({ title: table.title ?? table.tableKey, hideTitle: false, fill: true, preferenceKey: `log-lifecycle-diagnostic-table-${table.tableKey}`, rows: table.rows.map((cells, index) => ({ id: `${table.tableKey}:${table.rowOffset + index}`, cells })), columns, pagination: <Pager page={table.rowOffset / TABLE_PAGE_SIZE} size={TABLE_PAGE_SIZE} total={table.totalRows} onChange={onPage} /> })}</div>;
}
