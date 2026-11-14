import type { ReactNode } from 'react';
import { downloadBlob, safeFileName } from '../table/download';
import { toCsvDocument } from '../table/tableExport';

type ChartCsvMeta = {
  chartId: string; title: ReactNode; metricVersion?: string; unit: string;
  context: { scopeId?: string | null; from?: string | null; to?: string | null };
};

/** Both chart APIs export the applied context and keep their own table projection. */
export function downloadChartCsv(meta: ChartCsvMeta, headers: string[], rows: (string | number)[][]) {
  const { chartId, title, metricVersion, unit, context } = meta;
  const header = `# ${typeof title === 'string' ? title : chartId} · scopeId=${context.scopeId ?? ''} · from=${context.from ?? ''} · to=${context.to ?? ''}${metricVersion ? ` · metricVersion=${metricVersion}` : ''} · unit=${unit}`;
  const blob = new Blob([toCsvDocument(header, headers, rows)], { type: 'text/csv' });
  downloadBlob(blob, `${safeFileName(chartId)}.csv`);
}
