import { useCallback, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { MatrixCell } from '@ap/contracts';
import { MatrixToneLegend, PlatformDataTable, type PlatformColumn, type TableCell } from '@ap/components';
import { Button } from '@ap/ui';
import { COLUMN_LIMIT, isRowId, type ConfigRow, type ConfigValue, type PivotColumn, type PivotParams, type PivotResult, type PivotRow } from '../endpoints';
import { PrimaryChip, valueMeaning, valueTone, type Message } from './comparison';

export type EquipmentResult = Extract<PivotResult, { over: false }>;

const VALUE_STATES = new Set<ConfigValue['state']>(['equal', 'diff', 'violation', 'missing', 'not-comparable']);
const VISIBLE_WINDOW = { controls: null, summary: null };
const PAGE_OWNED_TOOLBAR = {};
const rowId = (row: PivotRow) => row.id;
const itemMetadata = ['key', 'module', 'category', 'item', 'filename', 'group', 'source', 'collectedAt'] as const;

export function validEquipmentResult(result: PivotResult, params: PivotParams) {
  if (!result || !Number.isSafeInteger(result.count) || result.count < 0) return false;
  if (result.over === true) return result.count > COLUMN_LIMIT;
  if (result.over !== false || result.count > COLUMN_LIMIT || !Array.isArray(result.columns) || !Array.isArray(result.rows) || result.columns.length !== result.count) return false;
  if (result.count === 0) return result.rows.length === 0;
  const ordered = params.mode === 'reference' ? [params.ref, ...params.eq.filter(id => id !== params.ref)] : params.eq;
  if (!result.columns.every(column => column && typeof column.id === 'string' && isRowId(column.id)
    && itemMetadata.every(field => typeof column[field] === 'string' && column[field].length > 0)
    && column.key.includes(column.filename))) return false;
  if (new Set(result.columns.map(column => column.id)).size !== result.count
    || new Set(result.columns.map(column => column.key)).size !== result.count) return false;
  return result.rows.length === ordered.length && result.rows.every((row, index) => row?.id === ordered[index]
    && row.values && result.columns.every(item => {
      const cell = row.values[item.id];
      return cell && VALUE_STATES.has(cell.state) && (cell.value === null || typeof cell.value === 'string' || Number.isFinite(cell.value));
    }));
}

export function itemFromEquipment(item: PivotColumn, rows: readonly PivotRow[]): ConfigRow {
  return { ...item, values: Object.fromEntries(rows.map(row => [row.id, row.values[item.id]])) };
}

function columnModel(data: EquipmentResult, params: PivotParams, m: Message) {
  const groups: Record<string, string> = {};
  const reference = params.mode === 'reference' ? params.ref : null;
  const columns: PlatformColumn<PivotRow>[] = [{
    id: 'equipment', header: m('equipment'), initialPin: 'left', hideable: false, selectableCell: false, sortable: false,
    cell: row => <span className="inline-flex min-w-0 items-center gap-2"><span className="t-mono">{row.id}</span>{row.id === reference && <PrimaryChip>{m('reference')}</PrimaryChip>}</span>,
  }];
  for (const item of data.columns) {
    const configItem = itemFromEquipment(item, data.rows);
    const levels = params.levels.map(level => item[level as 'module' | 'category' | 'item' | 'filename']);
    const ids = levels.map((_, index) => {
      const path = JSON.stringify(levels.slice(0, index + 1));
      const id = `group:${path}`;
      groups[id] = levels[index];
      return id;
    });
    const pathLabel = levels.join(' › ');
    const meanings = new Map(data.rows.map(({ id }) => [id, valueMeaning(configItem, id, params)]));
    columns.push({
      id: item.key, header: item.item, headerLabel: item.key, columnGroup: ids, sortable: false,
      cell: row => <span className="min-w-0 truncate t-mono">{row.values[item.id].value ?? '—'}</span>,
      cellTone: row => valueTone(meanings.get(row.id)),
      cellLabel: row => `${row.id} · ${pathLabel} · ${item.item} (${item.filename}) · ${row.values[item.id].value ?? '—'} · ${m(meanings.get(row.id)!)}`,
    });
  }
  return { columns, groups };
}

export function EquipmentAxisTable({ data, params, selection, selectedItem, onSelect, openDetail, openTrend, trendReason, m }: {
  data: EquipmentResult; params: PivotParams; selection: MatrixCell | null; selectedItem: ConfigRow | null;
  onSelect: (cell: MatrixCell, item: ConfigRow) => void; openDetail: () => void; openTrend: (id: string) => void; trendReason: string | null; m: Message;
}) {
  const { columns, groups } = useMemo(() => columnModel(data, params, m), [data, params, m]);
  const itemsByKey = useMemo(() => new Map(data.columns.map(item => [item.key, item])), [data.columns]);
  const selectionLabel = selectedItem && selection ? `${selectedItem.key} · ${selection.column}` : m('noSelection');
  const select = useCallback(({ row, column }: TableCell) => {
    const item = itemsByKey.get(column);
    if (item) onSelect({ row: item.id, column: row }, itemFromEquipment(item, data.rows));
  }, [itemsByKey, onSelect, data.rows]);
  const activate = useCallback(({ column }: TableCell) => {
    const item = itemsByKey.get(column);
    if (item) openTrend(item.id);
  }, [itemsByKey, openTrend]);
  return <>
    <PlatformDataTable title={m('title')} ariaLabel={m('title')} preferenceKey="configuration:equipment-axis" fill pageOwnedToolbar={PAGE_OWNED_TOOLBAR}
      externalPagination={VISIBLE_WINDOW} columnDividers rows={data.rows} columns={columns} columnGroups={groups} getRowId={rowId}
      pinnedRowId={params.mode === 'reference' ? params.ref : null}
      selectedCell={selectedItem && selection ? { row: selection.column, column: selectedItem.key } : null}
      onSelectCell={select} onActivateCell={activate} />
    <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border-subtle px-2 py-1 text-xs tabular" data-configuration-bottom>
      <span className="min-w-0 flex-1 truncate" title={selectedItem ? selectionLabel : undefined}>{m('equipmentCount', { count: data.rows.length })} · {m('selection')} {selectionLabel}</span>
      {trendReason && <span role="status" className="break-keep text-text-secondary">{trendReason}</span>}
      <MatrixToneLegend labels={{ info: m('valueDifference'), danger: m('violation'), missing: m('missingLegend') }} />
      <Button variant="ghost" size="toolbar" disabled={!selectedItem} onClick={openDetail}>{m('openSelected')}<ChevronRight className="size-3" /></Button>
    </div>
  </>;
}
