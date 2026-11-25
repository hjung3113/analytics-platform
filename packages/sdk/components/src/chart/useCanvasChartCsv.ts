import { useState } from 'react';
import { useMessages, usePlatformOptional } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import { displayFileName } from '../table/download';
import type { CsvVerbatim } from '../table/tableExport';
import { downloadChartCsv } from './analysisChartCsv';
import { useImageActionGate, type ChartExportActionsPolicy } from './ChartImageCopyButton';

type CsvRows = (string | number | CsvVerbatim)[][];

/**
 * The canvas charts' CSV wiring in one place (#2870 Q2): the export gate, the file name, the applied Context in the header and the
 * result line. The standalone result line belongs to one export generation: a change of any `resetOn` value (by `Object.is`), the
 * title or the standalone permission starts a new one and clears it. Rows are built inside the try, so a throwing consumer formatter
 * reports the failure like a failed download (#2792 C12).
 */
export function useCanvasChartCsv({ title, fallbackName, exportActions, resetOn }: {
  title: string;
  /** The file name when the title has no usable characters. */
  fallbackName: string;
  exportActions: ChartExportActionsPolicy | undefined;
  /** What the CSV is made of (rows, lanes, range…); a notice alone should not be in it. */
  resetOn: readonly unknown[];
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const key = [...resetOn, title, exportActions?.exportAllowed];
  const [generation, setGeneration] = useState({ key, n: 0 });
  if (key.length !== generation.key.length || key.some((value, i) => !Object.is(value, generation.key[i]))) setGeneration({ key, n: generation.n + 1 });
  const gate = useImageActionGate(exportActions, generation.n);
  const global = usePlatformOptional()?.global ?? null;
  const fileBase = displayFileName(title) || fallbackName;
  const exportCsv = (headers: string[], buildRows: () => CsvRows) => {
    try {
      downloadChartCsv({ chartId: fileBase, fileName: fileBase, title, context: global ?? {} }, headers, buildRows());
    } catch {
      gate.say(m('chartExportCsvFailed', { chartId: fileBase }), 'warning');
      return;
    }
    gate.say(m('chartExportedCsv', { chartId: fileBase }));
  };
  return { gate, fileBase, exportCsv };
}
