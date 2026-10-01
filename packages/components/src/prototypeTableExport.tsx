// THROWAWAY prototype for #172 — do not merge
/**
 * #172 throwaway prototype: row copy + CSV/TSV/XLSX export for PlatformDataTable, three toolbar
 * variants A/B/C switched by `?variant=` on the existing /equipment route (sub-shape A).
 * Prototype quality on purpose: no tests, minimal error handling — #173/#174 do this properly.
 */

import { ChevronDown, Copy, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';

export type TableExportVariant = 'A' | 'B' | 'C';
export const TABLE_EXPORT_VARIANTS: readonly TableExportVariant[] = ['A', 'B', 'C'];
/** Switcher pill labels (dev chrome, Korean fixed). */
export const TABLE_EXPORT_VARIANT_LABELS: Record<TableExportVariant, string> = {
  A: 'A — 내보내기 메뉴',
  B: 'B — 선택 동작 바',
  C: 'C — 분리 버튼 + 대상 표시',
};
const VARIANT_SESSION_KEY = 'platform:prototype:172:variant';
const isVariant = (v: string | null): v is TableExportVariant => !!v && (TABLE_EXPORT_VARIANTS as readonly string[]).includes(v);

/** `?variant=` first; sessionStorage fallback for navigations that drop the unknown key. Mirrors URL→session on read. */
export function readTableExportVariant(): TableExportVariant | null {
  let fromUrl: string | null = null;
  try { fromUrl = new URLSearchParams(window.location.search).get('variant'); } catch { /* non-browser */ }
  if (isVariant(fromUrl)) {
    try { sessionStorage.setItem(VARIANT_SESSION_KEY, fromUrl); } catch { /* memory-only */ }
    return fromUrl;
  }
  try {
    const stored = sessionStorage.getItem(VARIANT_SESSION_KEY);
    if (isVariant(stored)) return stored;
  } catch { /* memory-only */ }
  return null;
}

/** Clears the fallback so a dropped `?variant` really returns to today's UI. */
export function clearTableExportVariant(): void {
  try { sessionStorage.removeItem(VARIANT_SESSION_KEY); } catch { /* memory-only */ }
}

// ---------------------------------------------------------------------------
// Serializer: visible PlatformColumns (display order) → CSV / TSV / XLSX.
// ---------------------------------------------------------------------------

export type ExportCell = number | string;
/** Structural subset of PlatformColumn<T> the serializer needs (avoids a type-only import cycle). */
type ExportColumn<T> = { id: string; header: string; value?: (row: T) => unknown };

/** Header row = `header`, values = `value` (or `row[id]`). Numbers stay numbers, everything else becomes a string. */
export function serializeTableExport<T>(columns: ExportColumn<T>[], rows: T[]): { headers: string[]; cells: ExportCell[][] } {
  return {
    headers: columns.map(c => c.header),
    cells: rows.map(row => columns.map(c => {
      const v = c.value ? c.value(row) : (row as Record<string, unknown>)[c.id];
      return typeof v === 'number' ? v : v == null ? '' : String(v);
    })),
  };
}

const csvEscape = (v: ExportCell): string => (typeof v === 'string' && /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : String(v));

/** RFC 4180 CSV: UTF-8 BOM, CRLF line endings, quoting only where the grammar requires it. */
export function toCsv(headers: string[], cells: ExportCell[][]): string {
  const line = (row: ExportCell[]) => row.map(csvEscape).join(',');
  return '\uFEFF' + [line(headers), ...cells.map(line)].join('\r\n');
}

/** TSV for the clipboard: pastes into a spreadsheet as cells. */
export function toTsv(headers: string[], cells: ExportCell[][]): string {
  return [headers.join('\t'), ...cells.map(row => row.map(v => String(v)).join('\t'))].join('\r\n');
}

/**
 * XLSX via write-excel-file, loaded with a runtime `import()`: #172 requires the writer to load only
 * on click (spec-172.md §2), so pages that never export never pay for the module. A static top-level
 * import would put it on the PlatformDataTable critical path.
 */
export async function toXlsx(headers: string[], cells: ExportCell[][]): Promise<Blob> {
  const writeExcelFile = (await import('write-excel-file/browser')).default;
  return writeExcelFile([headers, ...cells]).toBlob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Variant UI pieces.
// ---------------------------------------------------------------------------

/** Export scope: how many rows a selection covers and how many the current filter matches. */
export type ExportTarget = { selected: number; filtered: number };
export const exportTargetKind = (t: ExportTarget): 'selected' | 'filtered' => (t.selected > 0 ? 'selected' : 'filtered');

/** Menu header wording (variant A): "선택 3행" / "필터 결과 전체 128행". */
export function targetText(target: ExportTarget, ko: boolean): string {
  return exportTargetKind(target) === 'selected'
    ? (ko ? `선택 ${target.selected}행` : `${target.selected} selected rows`)
    : (ko ? `필터 결과 전체 ${target.filtered}행` : `all ${target.filtered} filtered results`);
}

/** Always-visible line (variant C): "내보내기 대상: 필터 결과 128행" / "선택 3행 (필터 결과 128행 중)". */
export function targetStripText(target: ExportTarget, ko: boolean): string {
  if (exportTargetKind(target) === 'filtered') return ko ? `내보내기 대상: 필터 결과 ${target.filtered}행` : `Export target: ${target.filtered} filtered results`;
  return ko
    ? `내보내기 대상: 선택 ${target.selected}행 (필터 결과 ${target.filtered}행 중)`
    : `Export target: ${target.selected} selected (of ${target.filtered} filtered results)`;
}

const triggerClass = 'h-8 gap-1.5 rounded-sm border-border-strong';
const stripButtonClass = 'h-7 gap-1 rounded-sm px-2 text-[12px]';

/** A — one export menu: trigger keeps today's "내보내기" look; the menu names the target above the items. */
export function ExportToolbarMenuA({ target, onExport, onCopy, disabled, ko }: {
  target: ExportTarget; onExport: (format: 'xlsx' | 'csv') => void; onCopy: () => void; disabled?: boolean; ko: boolean;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="secondary" size="sm" className={triggerClass} disabled={disabled}>
        <Download className="size-3.5" aria-hidden />{ko ? '내보내기' : 'Export'}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-56">
      <DropdownMenuLabel className="t-caption tabular text-text-muted">{targetText(target, ko)}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onExport('xlsx')}><FileSpreadsheet className="size-3.5" aria-hidden />Excel (.xlsx)</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onExport('csv')}><FileText className="size-3.5" aria-hidden />CSV</DropdownMenuItem>
      <DropdownMenuItem onSelect={onCopy}><Copy className="size-3.5" aria-hidden />{ko ? '클립보드에 복사 (엑셀 붙여넣기용)' : 'Copy to clipboard (paste into Excel)'}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** B — split button shown when nothing is selected: main = Excel, ▾ = CSV, always all filtered rows. */
export function ExportToolbarSplitB({ onExport, disabled, ko }: {
  onExport: (format: 'xlsx' | 'csv') => void; disabled?: boolean; ko: boolean;
}) {
  return <span className="flex items-center">
    <Button variant="secondary" size="sm" className={cn(triggerClass, 'rounded-r-none')} disabled={disabled} onClick={() => onExport('xlsx')}>
      <FileSpreadsheet className="size-3.5" aria-hidden />Excel
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={ko ? 'CSV로 내보내기' : 'Export as CSV'} className={cn(triggerClass, 'rounded-l-none px-1.5')} disabled={disabled}>
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onExport('csv')}><FileText className="size-3.5" aria-hidden />CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </span>;
}

/** B — actions inside the existing blue selection bar, shown only while rows are selected. */
export function SelectionExportActionsB({ onCopy, onExport, disabled, ko }: {
  onCopy: () => void; onExport: (format: 'xlsx' | 'csv') => void; disabled?: boolean; ko: boolean;
}) {
  return <span className="flex items-center gap-1">
    <Button variant="secondary" size="sm" className={stripButtonClass} disabled={disabled} onClick={onCopy}><Copy className="size-3.5" aria-hidden />{ko ? '복사' : 'Copy'}</Button>
    <Button variant="secondary" size="sm" className={stripButtonClass} disabled={disabled} onClick={() => onExport('xlsx')}><FileSpreadsheet className="size-3.5" aria-hidden />Excel</Button>
    <Button variant="secondary" size="sm" className={stripButtonClass} disabled={disabled} onClick={() => onExport('csv')}><FileText className="size-3.5" aria-hidden />CSV</Button>
  </span>;
}

/** C — separate buttons: [복사] (needs a selection) and [내보내기 ▾] (Excel/CSV). */
export function ExportToolbarC({ hasSelection, onCopy, onExport, disabled, ko }: {
  hasSelection: boolean; onCopy: () => void; onExport: (format: 'xlsx' | 'csv') => void; disabled?: boolean; ko: boolean;
}) {
  return <span className="flex items-center gap-2">
    <Button variant="secondary" size="sm" className={triggerClass} disabled={disabled || !hasSelection} onClick={onCopy}>
      <Copy className="size-3.5" aria-hidden />{ko ? '복사' : 'Copy'}
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className={triggerClass} disabled={disabled}>
          <Download className="size-3.5" aria-hidden />{ko ? '내보내기' : 'Export'}<ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onExport('xlsx')}><FileSpreadsheet className="size-3.5" aria-hidden />Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('csv')}><FileText className="size-3.5" aria-hidden />CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </span>;
}

/** C — the one-line target strip under the toolbar; always visible. */
export function ExportTargetStripC({ target, ko }: { target: ExportTarget; ko: boolean }) {
  return <div className="flex min-h-7 items-center gap-2 border-t border-border-subtle bg-surface-sunken px-3 py-1 text-[12px] text-text-muted" aria-live="polite">
    {targetStripText(target, ko)}
  </div>;
}
