/** Local `yyyyMMdd-HHmm` stamp for export file names (table export, workbook export). */
export function fileStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** File-name part from a menu id: anything outside `A-Za-z0-9._-` becomes `-`. */
export const safeFileName = (base: string) => base.replace(/[^A-Za-z0-9._-]/g, '-');

/** A menu-given file name (Korean allowed): only characters no OS accepts in a file name, and controls, become `-`; `''` when nothing is left. */
export const displayFileName = (base: string) => base.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-').trim();

/** Starts the browser download of `blob` as `fileName`. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Safari/older Firefox cancel downloads whose blob URL is revoked synchronously — release after the click settles.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
