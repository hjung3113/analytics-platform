import { useMemo } from 'react';
import type { ApiResponse, ColumnFilter, ColumnFilterSpec, GroupedPageResult, TableQuery } from '@ap/contracts';
import { PlatformDataTable, type PlatformColumn } from '@ap/components';
import { StatusBadge } from '@ap/ui';
import {
  IMPORT_APPLY_STATUSES, IMPORT_PLAN_STATES, type ImportApplyStatus, type ImportDetail, type ImportDetailParams, type ImportJobView, type ImportPlanState, type ImportRowView,
} from '../../endpoints';
import { APPLY_LABEL, DETAIL_PAGE_SIZE, PLAN_LABEL, applyErrorText, cellOf, fetchAllRows, rowErrorText } from './importModel';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
const PLAN_TONE: Record<ImportPlanState, Tone> = { pending: 'neutral', new: 'success', update: 'info', unchanged: 'neutral', conflict: 'warning', error: 'danger' };
const APPLY_TONE: Record<ImportApplyStatus, Tone> = { applied: 'success', unchanged: 'neutral', skipped: 'neutral', excluded: 'neutral', unresolved: 'warning', conflict: 'warning', failed: 'danger' };
const planSpec: ColumnFilterSpec = { kind: 'enum', options: IMPORT_PLAN_STATES.filter(s => s !== 'pending').map(value => ({ value, label: PLAN_LABEL[value] })), ops: ['in', 'notIn'] };
const applySpec: ColumnFilterSpec = { kind: 'enum', options: IMPORT_APPLY_STATUSES.map(value => ({ value, label: APPLY_LABEL[value] })), ops: ['in', 'notIn'] };

/** What the row will do, in a sentence: row errors, or the maker and processes it brings along. */
export function planNote(row: ImportRowView): string {
  if (row.errors.length > 0) return row.errors.map(rowErrorText).join(' ');
  const parts: string[] = [];
  if (row.creates?.vendor !== undefined) parts.push(`새 설비사 ‘${row.creates.vendor}’`);
  if (row.creates && row.creates.processes.length > 0) parts.push(`새 공정 ${row.creates.processes.map(p => `‘${p}’`).join(', ')}`);
  if (parts.length > 0) return `${parts.join(' · ')}도 함께 추가합니다.`;
  if (row.planState === 'conflict') return '아래 「확인 필요 행 정리」에서 처리합니다.';
  return '';
}

export function importColumns(mode: 'plan' | 'result', mapping: Record<string, string> | null): PlatformColumn<ImportRowView>[] {
  const text = (kind: 'vendor' | 'model' | 'process') => (r: ImportRowView) => cellOf(r, kind, mapping);
  const first: PlatformColumn<ImportRowView>[] = [
    { id: 'rowNo', header: '행', size: 64, align: 'right', cell: r => <span className="tabular">{r.rowNo}</span>, exportValue: r => r.rowNo },
    { id: 'vendor', header: '설비사명', size: 150, sortable: false, cell: text('vendor'), exportValue: text('vendor') },
    { id: 'process', header: '공정명', size: 170, sortable: false, cell: text('process'), exportValue: text('process') },
    { id: 'model', header: '모델명', size: 170, sortable: false, cell: text('model'), exportValue: text('model') },
  ];
  if (mode === 'plan') {
    return [...first,
      { id: 'planState', header: '검사 결과', size: 116, sortable: false, filter: planSpec, filterPinned: 1, exportValue: r => PLAN_LABEL[r.planState], cell: r => <StatusBadge tone={PLAN_TONE[r.planState]}>{PLAN_LABEL[r.planState]}</StatusBadge> },
      { id: 'note', header: '내용', size: 360, sortable: false, cell: planNote, exportValue: planNote }];
  }
  const label = (r: ImportRowView) => (r.applyStatus ? APPLY_LABEL[r.applyStatus] : '—');
  return [...first,
    { id: 'applyStatus', header: '적용 결과', size: 116, sortable: false, filter: applySpec, filterPinned: 1, exportValue: label, cell: r => (r.applyStatus ? <StatusBadge tone={APPLY_TONE[r.applyStatus]}>{APPLY_LABEL[r.applyStatus]}</StatusBadge> : '—') },
    { id: 'note', header: '사유', size: 360, sortable: false, exportValue: r => applyErrorText(r.applyError), cell: r => applyErrorText(r.applyError) }];
}

type Fetch = (params: ImportDetailParams, signal?: AbortSignal) => Promise<ApiResponse<ImportDetail>>;

/**
 * Plan or result rows of one job, paged on the server (default 25 here, the contract allows 200). `onDetail` hands the latest job, counts
 * and total to the step. Export reads every page (200 each, the job holds at most 1,000 rows) with the table's filters and selection.
 */
export function ImportRowsTable({ mode, jobId, mapping, fetchDetail, onDetail, title }: {
  mode: 'plan' | 'result'; jobId: string; mapping: Record<string, string> | null; fetchDetail: Fetch; onDetail: (detail: ImportDetail) => void; title: string;
}) {
  const columns = useMemo(() => importColumns(mode, mapping), [mode, mapping]);
  const loadPage = async (query: TableQuery, signal: AbortSignal): Promise<ApiResponse<GroupedPageResult<ImportRowView>>> => {
    const res = await fetchDetail({ jobId, page: query.page, pageSize: query.pageSize, sorting: query.sorting, ...(query.filters ? { filters: query.filters } : {}) }, signal);
    if (res.outcome === 'ok' && res.data) onDetail(res.data);
    return { ...res, data: res.data ? { rows: res.data.rows, total: res.data.total } : null };
  };
  const exportRows = async (request: Parameters<NonNullable<Parameters<typeof PlatformDataTable<ImportRowView>>[0]['exportRows']>>[0], signal: AbortSignal): Promise<ApiResponse<ImportRowView[]>> => {
    const filters: ColumnFilter[] | undefined = request.scope.kind === 'selected' ? undefined : request.filters;
    const all = await fetchAllRows(page => fetchDetail({ jobId, ...page, sorting: [{ id: 'rowNo', desc: false }] }, signal), filters, DETAIL_PAGE_SIZE);
    const base = { assessments: [], trust: null, correlationId: '' };
    if (!all.ok) return { ...base, outcome: all.outcome as ApiResponse<never>['outcome'], data: null };
    const { scope } = request;
    const rows = scope.kind === 'selected' ? all.rows.filter(r => scope.ids.includes(String(r.rowNo)))
      : scope.kind === 'all' ? all.rows.filter(r => !scope.excludedIds.includes(String(r.rowNo))) : all.rows;
    return { ...base, outcome: rows.length === 0 ? 'empty' : 'ok', data: rows };
  };
  return <PlatformDataTable<ImportRowView>
    title={title} ariaLabel={title} columns={columns} getRowId={r => String(r.rowNo)} preferenceKey={`log-knowledge-import:${mode}:v1`} pageSize={25}
    loadPage={loadPage} exportRows={exportRows} height={420}
  />;
}

export type { ImportJobView };
