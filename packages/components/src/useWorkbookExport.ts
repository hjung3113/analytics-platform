import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import { isProductionEnv } from '@ap/ui';
import { downloadBlob, fileStamp, safeFileName } from './download';
import { EXPORT_REFUSAL } from './tableMessages';
import { toWorkbookXlsx, WorkbookError, WORKBOOK_LIMITS, type WorkbookSheet } from './workbook';

type Lang = 'ko' | 'en';
const WORKBOOK_TEXT = {
  done: { ko: 'Excel 파일로 내보냈습니다', en: 'Exported to an Excel file' },
  tooLarge: {
    ko: `내보낼 데이터가 브라우저 내보내기 상한(시트 ${WORKBOOK_LIMITS.sheets}개, 시트마다 ${WORKBOOK_LIMITS.rowsPerSheet.toLocaleString('ko-KR')}행, 셀 ${WORKBOOK_LIMITS.cells.toLocaleString('ko-KR')}개)을 넘었습니다. 필터를 좁혀 주세요.`,
    en: `The data is over the browser export limit (${WORKBOOK_LIMITS.sheets} sheets, ${WORKBOOK_LIMITS.rowsPerSheet.toLocaleString('en-US')} rows per sheet, ${WORKBOOK_LIMITS.cells.toLocaleString('en-US')} cells). Narrow the filter.`,
  },
} as const;
const SIZE_CODES = new Set(['too-many-sheets', 'too-many-rows', 'too-many-cells']);

export type WorkbookExportOptions = {
  /** File name without extension and stamp; defaults to the menu id. Characters outside `A-Za-z0-9._-` become `-`. */
  fileName?: string;
};

export type WorkbookExport = {
  /** The menu declares `features.export` (06 §15). `exportWorkbook` does nothing when false; hide or disable the trigger. */
  canExport: boolean;
  /** A workbook is being built; a second `exportWorkbook` call is ignored meanwhile. */
  exporting: boolean;
  /**
   * Builds the sheets (`build` may read the server; it gets this export's `AbortSignal`), checks them (`checkWorkbook`) and
   * downloads `<fileName>-<yyyyMMdd-HHmm>.xlsx`. The SDK owns the toasts: done, over the limits, failed. An abort (`cancel`,
   * unmount) ends silently.
   */
  exportWorkbook: (build: (signal: AbortSignal) => readonly WorkbookSheet[] | Promise<readonly WorkbookSheet[]>, options?: WorkbookExportOptions) => Promise<void>;
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
    if (!canExport || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setExporting(true);
    const l = lang as Lang;
    try {
      const sheets = await build(controller.signal);
      if (controller.signal.aborted) return;
      const blob = await toWorkbookXlsx(sheets, controller.signal);
      if (controller.signal.aborted) return;
      downloadBlob(blob, `${safeFileName(options?.fileName ?? menuId ?? 'workbook')}-${fileStamp(new Date())}.xlsx`);
      toast(WORKBOOK_TEXT.done[l]);
    } catch (error) {
      // Only this export's own abort is silent: a `build` that rejects with its own AbortError (a timeout) is a failure.
      if (controller.signal.aborted) return;
      if (error instanceof WorkbookError && SIZE_CODES.has(error.code)) {
        toast(WORKBOOK_TEXT.tooLarge[l], 'warning');
        return;
      }
      // A sheet-name error is the menu's declaration bug: loud in dev, the generic failure toast for the user.
      if (!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) console.error(error);
      toast(EXPORT_REFUSAL.error[l], 'warning');
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
