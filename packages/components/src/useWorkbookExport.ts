import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiResponse, Trust } from '@ap/contracts';
import { useI18n, usePlatform } from '@ap/kernel';
import { isProductionEnv } from '@ap/ui';
import { displayFileName, downloadBlob, fileStamp, safeFileName } from './download';
import { EXPORT_REFUSAL, exportRefusal, provisionalSuffix } from './tableMessages';
import { toWorkbookXlsx, WorkbookError, WORKBOOK_LIMITS, type WorkbookSheet } from './workbook';

type Lang = 'ko' | 'en';
const WORKBOOK_TEXT = {
  done: { ko: 'Excel 파일로 내보냈습니다', en: 'Exported to an Excel file' },
  tooLarge: {
    ko: `내보낼 데이터가 브라우저 내보내기 상한(시트마다 ${WORKBOOK_LIMITS.rowsPerSheet.toLocaleString('ko-KR')}행·${WORKBOOK_LIMITS.columns.toLocaleString('ko-KR')}열, 셀 ${WORKBOOK_LIMITS.cells.toLocaleString('ko-KR')}개)을 넘었습니다. 필터를 좁혀 주세요.`,
    en: `The data is over the browser export limit (${WORKBOOK_LIMITS.rowsPerSheet.toLocaleString('en-US')} rows and ${WORKBOOK_LIMITS.columns.toLocaleString('en-US')} columns per sheet, ${WORKBOOK_LIMITS.cells.toLocaleString('en-US')} cells). Narrow the filter.`,
  },
} as const;
/** The data's size, which the user can narrow; every other `WorkbookError` is the menu's declaration bug. */
const SIZE_CODES = new Set(['too-many-rows', 'too-many-columns', 'too-many-cells']);

/**
 * Thrown by a `build` whose server read was refused: the SDK shows the same cause, next action and server detail
 * (message, correlationId) as the table export (06 §26), instead of the generic failure.
 */
export class WorkbookRefusal extends Error {
  constructor(readonly response: ApiResponse<unknown> & { outcome: 'forbidden' | 'too_large' | 'timeout' | 'error' }) {
    super(`Workbook build refused: ${response.outcome}`);
    this.name = 'WorkbookRefusal';
  }
}

export type WorkbookExportOptions = {
  /** File name without extension and stamp (Korean allowed); defaults to the menu id. Characters no OS accepts become `-`. */
  fileName?: string;
  /** Data Trust of what was read: provisional data gets `-provisional` in the file name and the provisional note in the toast, like the table export. */
  trust?: Trust | null;
};

/** How one `exportWorkbook` call ended. `refused`: a `WorkbookRefusal` or `build`'s own timeout. `ignored`: no `features.export`, or another export was running. */
export type WorkbookExportResult = 'done' | 'refused' | 'too-large' | 'failed' | 'cancelled' | 'ignored';

export type WorkbookExport = {
  /** The menu declares `features.export` (06 §15). `exportWorkbook` does nothing when false; hide or disable the trigger. */
  canExport: boolean;
  /** A workbook is being built; a second `exportWorkbook` call is ignored meanwhile. The menu shows it (busy trigger), the SDK announces only the end. */
  exporting: boolean;
  /**
   * Builds the sheets (`build` may read the server; it gets this export's `AbortSignal` and throws `WorkbookRefusal` for a
   * refused read), checks them (`checkWorkbook`) and downloads `<fileName>-<yyyyMMdd-HHmm>.xlsx`. The SDK owns the toasts:
   * done, refused, over the limits, failed. An abort (`cancel`, unmount) ends silently.
   */
  exportWorkbook: (
    build: (signal: AbortSignal) => readonly WorkbookSheet[] | Promise<readonly WorkbookSheet[]>,
    options?: WorkbookExportOptions,
  ) => Promise<WorkbookExportResult>;
  /** Abandons the export in progress, e.g. when the data it reads has changed. */
  cancel: () => void;
};

/**
 * Menu-declared multi-sheet Excel export (#860): the menu builds `WorkbookSheet[]`, the SDK gates, guards re-entry, cancels,
 * checks, writes and downloads. Different from the table's own export (`PlatformDataTable` `exportRows`), which keeps its
 * fixed 데이터 + 조회 정보 sheets.
 */
export function useWorkbookExport(): WorkbookExport {
  const { lang } = useI18n();
  const { route, toast } = usePlatform();
  const canExport = !!route?.menu.features.export;
  const menuId = route?.menu.id;
  const [exporting, setExporting] = useState(false);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  const exportWorkbook = useCallback<WorkbookExport['exportWorkbook']>(async (build, options) => {
    if (!canExport || running.current) return 'ignored';
    const controller = new AbortController();
    running.current = controller;
    setExporting(true);
    const l = lang as Lang;
    try {
      const sheets = await build(controller.signal);
      if (controller.signal.aborted) return 'cancelled';
      const blob = await toWorkbookXlsx(sheets, controller.signal);
      if (controller.signal.aborted) return 'cancelled';
      const base = (options?.fileName !== undefined && displayFileName(options.fileName)) || safeFileName(menuId ?? 'workbook');
      downloadBlob(blob, `${base}-${fileStamp(new Date())}${options?.trust?.provisional ? '-provisional' : ''}.xlsx`);
      toast(WORKBOOK_TEXT.done[l] + provisionalSuffix(options?.trust, l));
      return 'done';
    } catch (error) {
      // Only this export's own abort is silent; a `build` that rejects with its own AbortError/TimeoutError
      // (`AbortSignal.timeout`) timed out — the same cause as a server `timeout` refusal.
      if (controller.signal.aborted) return 'cancelled';
      if (error instanceof WorkbookRefusal) {
        const refusal = exportRefusal(error.response.outcome, error.response, l);
        toast(refusal.text, 'warning', refusal.detail);
        return 'refused';
      }
      // By name: a DOMException is not an `Error` instance in every runtime (jsdom).
      const name = (error as { name?: unknown } | null)?.name;
      if (name === 'AbortError' || name === 'TimeoutError') {
        toast(EXPORT_REFUSAL.timeout[l], 'warning');
        return 'refused';
      }
      if (error instanceof WorkbookError && SIZE_CODES.has(error.code)) {
        toast(WORKBOOK_TEXT.tooLarge[l], 'warning');
        return 'too-large';
      }
      // A sheet-name or sheet-count error is the menu's declaration bug: loud in dev, the generic failure toast for the user.
      if (!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) console.error(error);
      toast(EXPORT_REFUSAL.error[l], 'warning');
      return 'failed';
    } finally {
      if (running.current === controller) { running.current = null; setExporting(false); }
    }
  }, [canExport, lang, menuId, toast]);

  const cancel = useCallback(() => {
    running.current?.abort();
    running.current = null;
    setExporting(false);
  }, []);

  return { canExport, exporting, exportWorkbook, cancel };
}
