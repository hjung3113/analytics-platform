import { useMemo, type RefObject } from 'react';
import type { AnalysisSelection, EndpointSpec } from '@ap/contracts';
import { useI18n, useMenuQuery, useMessages, type Text } from '@ap/kernel';
import { useSurfacePaused } from '@ap/ui';
import { DetailDrawer } from '../drawer/DetailDrawer';
import { COMPONENTS_MESSAGES } from '../messages';
import { QueryView } from '../StateView';
import { PlatformDataTable, type PlatformColumn } from '../table/PlatformDataTable';

export type NextAnalysisSourceRows<T> = { rows: readonly T[]; total?: number; truncated?: boolean };

export type NextAnalysisRows<P, T> = {
  endpoint: EndpointSpec<P, NextAnalysisSourceRows<T>>;
  params: (selection: AnalysisSelection) => P;
  columns: PlatformColumn<T>[];
  getRowId: (row: T) => string;
  title?: Text;
  /** Optional display cap. Defaults to the endpoint's declared row limit. */
  maxRows?: number;
};

export function NextAnalysisRowsDrawer<P, T>({ chartId, declaration, selection, formatRange, returnFocus, returnFocusRef, onClose }: {
  chartId: string;
  declaration: NextAnalysisRows<P, T>;
  selection: AnalysisSelection;
  formatRange: (value: string) => string;
  returnFocus?: () => boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const { tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const title = declaration.title ? tx(declaration.title) : m('chartSourceRows');
  const subtitle = selection.shape === 'set' ? selection.values.join(', ') : `${formatRange(selection.from)} → ${formatRange(selection.to)}`;
  return <DetailDrawer title={title} subtitle={subtitle} focusOnOpen copyPage={null}
    returnFocus={returnFocus} returnFocusRef={returnFocusRef} onClose={onClose}
    tabs={[{ id: 'rows', label: title, regions: {
      body: <SourceRowsTable declaration={declaration} selection={selection} title={title} chartId={chartId} />,
    } }]} />;
}

function SourceRowsTable<P, T>({ declaration, selection, title, chartId }: {
  declaration: NextAnalysisRows<P, T>; selection: AnalysisSelection; title: string; chartId: string;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { endpoint, params, columns, getRowId, maxRows = endpoint.limits?.maxRows } = declaration;
  const paused = useSurfacePaused();
  const query = useMenuQuery(endpoint, params(selection), { enabled: !paused });
  const filterKey = selection.shape === 'set'
    ? JSON.stringify(['set', selection.values])
    : JSON.stringify(['range', selection.from, selection.to]);
  const response = query.response;
  const data = response?.outcome === 'ok' && Array.isArray(response.data?.rows) ? response.data : null;
  const rows = useMemo(() => {
    if (data && maxRows !== undefined && data.rows.length > maxRows) return data.rows.slice(0, maxRows);
    return data?.rows;
  }, [data, maxRows]);
  const capped = data && rows && (data.truncated || data.rows.length > rows.length || (data.total ?? 0) > rows.length);
  let result = query;
  if (response?.outcome === 'ok') {
    if (!data) result = { ...query, response: { ...response, data: null, outcome: 'error' } };
    else if (rows?.length === 0) result = { ...query, response: { ...response, outcome: 'empty' } };
  }
  return <>
    {capped && <p role="status" className="mb-2 text-sm text-text-secondary">{m('chartSourceRowsCapped', { count: rows.length })}</p>}
    <QueryView query={result} widgetName={title} hideWidgetName compact>
      {page => <PlatformDataTable title={title} hideTitle ariaLabel={title} rows={rows ?? page.rows}
        columns={columns} getRowId={getRowId} filterKey={filterKey} preferenceKey={`chart-source-rows:${endpoint.id}:${chartId}`} />}
    </QueryView>
  </>;
}
