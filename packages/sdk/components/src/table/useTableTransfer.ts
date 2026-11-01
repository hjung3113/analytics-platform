import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import type { ApiResponse, Capability, ColumnFilter, ColumnFilterSpec, ContextKey, PageSort } from '@ap/contracts';
import { useEquipmentAxes, useI18n, usePlatform, useQueryContext } from '@ap/kernel';
import { isProductionEnv } from '@ap/ui';
import type { PlatformColumn } from './PlatformDataTable';
import { downloadBlob, fileStamp, safeFileName } from './download';
import { exportCell, exportColumns, toClipboardHtml, toCsv, toTsv, toXlsx } from './tableExport';
import {
  clipboardFailure, copiedText, copyingNote, copyRowCapNote, copyUnavailable, exportDoneText, EXPORT_REFUSAL, exportPreparingNote, exportRefusal, EXPORT_ROW_CAP,
  exportRowCapNote, exportTarget, globalContextRows, INFO_LABELS, loadedRowsOnlyNote, noSelectedOnPage, provisionalSuffix, selectionShortNote,
  type ExportFormat, type ExportScopeKind,
} from './tableMessages';
import type { Preferences } from './useColumnPreferences';
import type { TableExportRequest } from './useTableSelection';
import { filterInfoRows } from './columnFilters';

/**
 * Row copy (#174) clipboard path, by feature detection — never by `.catch`: in an insecure context (in-house HTTP)
 * `navigator.clipboard` is undefined and touching it throws synchronously.
 */
function asyncClipboard(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem !== 'undefined';
}
/** A copy that stops with a message for the user (refusal, reconciliation to zero rows, cap, serializer bug). */
class CopyStop extends Error { constructor(message: string, readonly detail?: string) { super(message); } }
type CopyPayload = { tsv: string; html: string; count: number };
/** The clipboard write itself was rejected (not the row read): carries the browser's error. */
class ClipboardRejected extends Error { constructor(readonly cause: unknown) { super('clipboard rejected'); } }

type TransferInput<T> = {
  columns: PlatformColumn<T>[];
  getRowId: (row: T) => string;
  exportRows: ((request: TableExportRequest, signal: AbortSignal) => Promise<ApiResponse<T[]>>) | undefined;
  /** Menu note appended to the export toast. */
  menuNote: string | undefined;
  exportFilterSummary: readonly (readonly [string, string])[] | undefined;
  exportContext: Readonly<Partial<Record<ContextKey, Capability>>> | undefined;
  canExport: boolean;
  selectedIds: string[];
  selection: RowSelectionState;
  /** A whole-result selection (#556c): exported as the `all` scope; copy is unavailable (it reads loaded rows only). */
  allSelection: { excludedIds: string[]; count: number } | null;
  /** Active column filters: sent with a `filtered` export and listed on the 조회 정보 sheet (#556b). */
  columnFilters: ColumnFilter[];
  /** Filterable fields (columns and non-column) — the one label source of the XLSX 조회 정보 `필터 · <label>` rows. */
  filterFields: readonly { id: string; label: string; spec: ColumnFilterSpec }[];
  /** Rows of the shown page, for the loaded-rows-only copy path. */
  loadedRows: T[];
  /** Total of the shown result; only meaningful when `resultOk`. */
  total: number;
  /** The shown response is `ok` (the filtered count is known). */
  resultOk: boolean;
  activeSorting: PageSort[];
  preferences: Preferences;
  /** Column popover / export menu open: the Ctrl/⌘+C shortcut stays native while either is open. */
  overlayOpen: { columns: boolean; export: boolean };
};

/**
 * Table-owned export (#173, 06 §15) and row copy (#174): the abort controllers, busy flags and polite announcements,
 * the clipboard paths and the Ctrl/⌘+C shortcut. `abortTransfers` is for the table's Context change; unmount aborts here.
 */
export function useTableTransfer<T>(input: TransferInput<T>) {
  const { columns, getRowId, canExport, selectedIds, selection, activeSorting, preferences, overlayOpen } = input;
  const { lang, t } = useI18n();
  const { global, route, toast } = usePlatform();
  const queryContext = useQueryContext();
  const axes = useEquipmentAxes();
  const [exporting, setExporting] = useState(false);
  /** Polite “준비 중” announcement next to the trigger (#173 UX P2-3); visually hidden so the toolbar width stays stable. */
  const [exportNote, setExportNote] = useState<string | null>(null);
  /** Copy keeps its own line (#174 review P3-1): one operation finishing never clears the other's announcement. */
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  /** Row copy (#174): busy flag + its own abort (a Context change abandons the read). */
  const [copying, setCopying] = useState(false);
  const copyAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { exportAbort.current?.abort(); copyAbort.current?.abort(); }, []);
  /** An in-flight export/copy belongs to the old result set. */
  function abortTransfers() {
    exportAbort.current?.abort();
    copyAbort.current?.abort();
  }

  /** Export serializer for rows already read: header + cells of the visible exportable columns. Throws on a column bug. */
  function serialize(rows: T[]): { headers: string[]; cells: (string | number)[][] } {
    const exportable = exportColumns(columns, preferences);
    return { headers: exportable.map(c => c.header), cells: rows.map(row => exportable.map(c => exportCell(c, row))) };
  }

  // Table-owned export (#173): the target (selection / all filtered rows) and format come from the chosen menu item —
  // a selection never hides "all filtered". The menu only supplies the row read; outcome handling, reconciliation,
  // size guard, file and toasts live here.
  async function runExport(format: ExportFormat, kind: ExportScopeKind) {
    if (exportAbort.current) return; // busy guard (#173 review P3-3): the trigger uses aria-disabled, so re-entry is possible
    const allSelection = kind === 'selected' ? input.allSelection : null;
    const scope: TableExportRequest['scope'] = allSelection ? { kind: 'all', excludedIds: allSelection.excludedIds }
      : kind === 'selected' ? { kind: 'selected', ids: selectedIds } : { kind: 'filtered' };
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting(true);
    const startTarget = exportTarget(kind, kind === 'selected' ? (allSelection ? allSelection.count : selectedIds.length) : input.resultOk ? input.total : null, lang);
    setExportNote(exportPreparingNote(startTarget, format, lang));
    // Only this export's controller cancels (#186, like the Kernel #183): an exportRows that rejects with its
    // own DOMException('…','AbortError') (internal timeout) is a failure, so the failure toast must appear.
    const cancelled = () => controller.signal.aborted;
    try {
      const filters = scope.kind !== 'selected' && input.columnFilters.length > 0 ? input.columnFilters : undefined;
      const response = await input.exportRows!({ scope, sorting: activeSorting, ...(filters ? { filters } : {}) }, controller.signal);
      if (controller.signal.aborted) return;
      if (response.outcome !== 'ok' && response.outcome !== 'empty') {
        const refusalOf = exportRefusal(response.outcome, response, lang);
        toast(refusalOf.text, 'warning', refusalOf.detail);
        return;
      }
      let rows: T[] = response.outcome === 'empty' ? [] : response.data ?? [];
      if (scope.kind === 'selected') {
        // The server already filtered by ids; reconcile again by getRowId — a row can have left the current result.
        const wanted = new Set(scope.ids);
        rows = rows.filter(row => wanted.has(getRowId(row)));
        const missing = scope.ids.length - rows.length;
        if (missing > 0) {
          toast(selectionShortNote(scope.ids.length, rows.length, lang), 'warning');
        }
      }
      if (rows.length > EXPORT_ROW_CAP) {
        toast(exportRowCapNote(lang), 'warning');
        return;
      }
      // Serializer (#173 review P2-1): outside the server-request try, so a column bug is not reported as a server
      // failure. Dev logs the error — it names the column that needs exportValue; production stays silent + toast.
      let headers: string[];
      let cells: (string | number)[][];
      try {
        ({ headers, cells } = serialize(rows));
      } catch (error) {
        if (!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) console.error(error);
        toast(EXPORT_REFUSAL.error[lang], 'warning');
        return;
      }
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = fileStamp(now);
      const target = exportTarget(kind, rows.length, lang);
      let blob: Blob;
      if (format === 'csv') {
        blob = new Blob([toCsv(headers, cells)], { type: 'text/csv;charset=utf-8' });
      } else {
        // "조회 정보" sheet: what was exported, from which Context, with which filters and trust. Missing values stay
        // empty — never invented. Values render like the screen: times space-separated, coverage as a percent string.
        const trust = response.trust;
        // Labels follow the UI language, like the menus' exportFilterSummary (#173 review N-P3-4). 기간/Scope are written
        // only when they apply (export endpoint's — else the manifest's — time 'apply' / requiresScope) — never a condition that did not filter (N-P2-1).
        const L = INFO_LABELS[lang];
        const menu = route?.menu;
        const appliedContext = input.exportContext ?? menu?.context;
        const info: [string, string | number][] = [
          [L.menu, menu?.id ?? ''],
          [L.target, exportTarget(kind, rows.length, lang)],
          [L.exportedAt, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`],
          ...(menu?.requiresScope ? [['Scope', global.scopeId ?? ''] as [string, string]] : []),
          ...(appliedContext?.time === 'apply' ? [[L.period, global.from && global.to ? `${global.from} – ${global.to}` : ''] as [string, string]] : []),
          ...(input.exportFilterSummary ?? []).map(([label, value]) => [label, value] as [string, string]),
          ...(filters ? filterInfoRows(filters, input.filterFields.map(f => ({ id: f.id, label: f.label, filter: f.spec })), lang) : []),
          ...(appliedContext ? globalContextRows(queryContext, appliedContext, lang, axes, t('membershipAsOf')) : []),
          [L.updatedAt, trust?.updatedAt?.replace('T', ' ') ?? ''],
          [L.dataThrough, trust?.dataThrough?.replace('T', ' ') ?? ''],
          [L.coverage, trust != null && trust.coverage !== null ? `${(trust.coverage * 100).toFixed(1)}%` : ''],
          [L.metricVersion, trust?.metricVersion ?? ''],
          [L.provisional, trust ? (trust.provisional ? L.provisionalYes : L.provisionalNo) : ''],
          [L.source, trust?.source ?? ''],
          ['Correlation ID', response.correlationId ?? ''],
        ];
        blob = await toXlsx(headers, cells, info, lang);
        if (controller.signal.aborted) return;
      }
      downloadBlob(blob, `${safeFileName(route?.menu.id ?? 'table')}-${stamp}${response.trust?.provisional ? '-provisional' : ''}.${format}`);
      const done = exportDoneText(target, format, lang);
      const provisional = provisionalSuffix(response.trust, lang);
      toast(input.menuNote ? `${done}${provisional} — ${input.menuNote}` : done + provisional);
    } catch (error) {
      if (cancelled()) return;
      toast(EXPORT_REFUSAL.error[lang], 'warning');
    } finally {
      if (exportAbort.current === controller) { exportAbort.current = null; setExporting(false); setExportNote(null); }
    }
  }

  // Row copy (#174, ADR-0008 toolbar D): copy is an export — same gate, same `exportRows` read, columns and values; TSV
  // for spreadsheets plus `text/html` so leading zeros stay text. Secure context: ClipboardItem with promised blobs,
  // written inside the user gesture and filled after the server read (multi-page selections copy in full). Insecure
  // context (and browsers refusing promised ClipboardItem values): `execCommand('copy')` inside the gesture with a
  // document-level one-shot `copy` listener — the event goes to the selection's node or <body>, not the table
  // (review P1-1) — loaded rows only, with a toast when that is less than the selection.
  function payload(rows: T[]): CopyPayload {
    let serialized: ReturnType<typeof serialize>;
    try { serialized = serialize(rows); } catch (error) {
      if (!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) console.error(error);
      throw new CopyStop(EXPORT_REFUSAL.error[lang]);
    }
    return { tsv: toTsv(serialized.headers, serialized.cells), html: toClipboardHtml(serialized.headers, serialized.cells), count: rows.length };
  }
  /** Server read of the selection in the table's sort, reconciled by getRowId like export. Rejects with CopyStop for the user. */
  async function readSelection(ids: string[], signal: AbortSignal): Promise<CopyPayload> {
    const response = await input.exportRows!({ scope: { kind: 'selected', ids }, sorting: activeSorting }, signal);
    // Same controller whose catch checks `signal.aborted` (#186): this throw is the table's own cancel there.
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (response.outcome !== 'ok' && response.outcome !== 'empty') {
      const refusalOf = exportRefusal(response.outcome, response, lang);
      throw new CopyStop(refusalOf.text, refusalOf.detail);
    }
    const wanted = new Set(ids);
    const rows = (response.outcome === 'empty' ? [] : response.data ?? []).filter(row => wanted.has(getRowId(row)));
    const missing = ids.length - rows.length;
    if (missing > 0) {
      const note = selectionShortNote(ids.length, rows.length, lang);
      if (rows.length === 0) throw new CopyStop(note);
      toast(note, 'warning');
    }
    if (rows.length > EXPORT_ROW_CAP) throw new CopyStop(copyRowCapNote(lang));
    return payload(rows);
  }
  /** Must run synchronously inside the click/keydown: `clipboard.write` / `execCommand` are called before any await. */
  function runCopy() {
    if (!canExport || input.allSelection || selectedIds.length === 0 || copyAbort.current) return; // gate + busy guard
    if (!asyncClipboard()) { copyLoaded(); return; }
    const ids = selectedIds;
    const controller = new AbortController();
    const content = readSelection(ids, controller.signal);
    content.catch(() => {}); // observed below; avoids an unhandled rejection while the clipboard write is pending
    // A refusal rejects `content` and both derived blobs with it: mark the blobs handled so the failure surfaces
    // only as the CopyStop toast, never as an unhandled rejection (ClipboardItem still sees the real rejection).
    const blob = (pick: (c: CopyPayload) => string, type: string) => {
      const item = content.then(c => new Blob([pick(c)], { type }));
      item.catch(() => {});
      return item;
    };
    const blobs = { 'text/plain': blob(c => c.tsv, 'text/plain'), 'text/html': blob(c => c.html, 'text/html') };
    let write: Promise<void>;
    try {
      write = navigator.clipboard.write([new ClipboardItem(blobs)]);
    } catch (error) {
      controller.abort(); // the read is not needed
      Object.values(blobs).forEach(b => b.catch(() => {})); // nobody consumes them now
      // A browser that refuses promised values still has the gesture: copy the loaded rows synchronously (review P3-2).
      if (error instanceof TypeError) copyLoaded();
      else toast(clipboardFailure(error, lang), 'warning');
      return;
    }
    copyAbort.current = controller;
    setCopying(true);
    setCopyNote(copyingNote(ids.length, lang));
    void (async () => {
      try {
        try { await write; } catch (error) {
          await content; // a refusal or a failed read surfaces as itself, not as a clipboard error
          throw new ClipboardRejected(error);
        }
        const c = await content;
        if (!controller.signal.aborted) toast(copiedText(c.count, lang));
      } catch (error) {
        // Only the copy's own controller cancels (#186, like the Kernel #183). The internal throw in
        // `readSelection` uses this same controller's signal, so it still lands here as a cancellation.
        if (controller.signal.aborted) return;
        if (error instanceof CopyStop) toast(error.message, 'warning', error.detail);
        // A late TypeError (promised values refused after the gesture): this browser cannot copy here.
        else if (error instanceof ClipboardRejected) toast(error.cause instanceof TypeError ? copyUnavailable(lang) : clipboardFailure(error.cause, lang), 'warning');
        else toast(EXPORT_REFUSAL.error[lang], 'warning'); // the row read threw (network…)
      } finally {
        if (copyAbort.current === controller) { copyAbort.current = null; setCopying(false); setCopyNote(null); }
      }
    })();
  }
  /** Loaded rows only, synchronously inside the gesture. Never a silent subset, never a silent no-op. */
  function copyLoaded() {
    const loaded = input.loadedRows.filter(row => selection[getRowId(row)]);
    if (loaded.length === 0) {
      toast(noSelectedOnPage(lang), 'warning');
      return;
    }
    let content: CopyPayload;
    try { content = payload(loaded); } catch (error) { toast((error as Error).message, 'warning'); return; }
    let handled = false;
    const onDocumentCopy = (e: globalThis.ClipboardEvent) => {
      if (!e.clipboardData) return;
      e.clipboardData.setData('text/plain', content.tsv);
      e.clipboardData.setData('text/html', content.html);
      e.preventDefault();
      handled = true;
    };
    document.addEventListener('copy', onDocumentCopy, true);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; } finally { document.removeEventListener('copy', onDocumentCopy, true); }
    if (!copied || !handled) { toast(copyUnavailable(lang), 'warning'); return; }
    if (loaded.length < selectedIds.length) {
      toast(loadedRowsOnlyNote(loaded.length, lang), 'warning');
    }
    toast(copiedText(content.count, lang));
  }
  /** Ctrl/⌘+C belongs to the table only with a selection, focus in the table section, and nothing native to copy. */
  function shortcutApplies(target: EventTarget | null): boolean {
    if (!canExport || input.allSelection || selectedIds.length === 0 || overlayOpen.columns || overlayOpen.export) return false;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"], [role="dialog"], [data-radix-popper-content-wrapper]')) return false;
    if (target instanceof HTMLElement && target.isContentEditable) return false;
    return !(window.getSelection()?.toString());
  }
  /** Both paths run from the keydown itself (the gesture), so the table never depends on where a copy event lands. */
  function onShortcut(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'c' || !shortcutApplies(e.target)) return;
    e.preventDefault();
    runCopy();
  }
  return { exporting, copying, exportNote, copyNote, runExport, runCopy, onShortcut, abortTransfers };
}
