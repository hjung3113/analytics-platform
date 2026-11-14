import type { ECharts } from 'echarts/core';
import { formatText, type Lang } from '@ap/kernel';
import { readColorToken } from '@ap/ui/theme';
import { COMPONENTS_MESSAGES } from '../messages';
import { downloadBlob } from '../table/download';
import { chartTheme } from './EChart';

export type ImageCopyOutcome = 'copied' | 'downloaded' | 'failed';

/** Same feature detection as the table's row copy (`table/useTableTransfer.ts`): never `.catch` on a missing `navigator.clipboard`, which is undefined in an insecure context (in-house HTTP). */
function asyncClipboard(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem !== 'undefined';
}

/**
 * Copies a PNG. Must run synchronously inside the click: `produce` is called there, and the clipboard write starts there with a promised blob.
 * No secure clipboard, or a rejected write: the same PNG is downloaded as `fileName`. `'failed'` = neither worked.
 */
export function copyChartImage(produce: () => Blob | Promise<Blob>, fileName: string): Promise<ImageCopyOutcome> {
  let blob: Promise<Blob>;
  try { blob = Promise.resolve(produce()); } catch { return Promise.resolve('failed'); }
  blob.catch(() => {}); // observed below; avoids an unhandled rejection while the write is pending
  const download = async (): Promise<ImageCopyOutcome> => {
    try { downloadBlob(await blob, fileName); return 'downloaded'; } catch { return 'failed'; }
  };
  if (!asyncClipboard()) return download();
  let write: Promise<void>;
  try { write = navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch { return download(); }
  return write.then<ImageCopyOutcome, ImageCopyOutcome>(() => 'copied', download);
}

const IMAGE_COPY_KEY = {
  copied: 'chartImageCopied',
  downloaded: 'chartImageDownloaded',
  failed: 'chartImageFailed',
} as const satisfies Record<ImageCopyOutcome, keyof typeof COMPONENTS_MESSAGES>;

export function imageCopyText(outcome: ImageCopyOutcome, lang: Lang): string {
  return formatText(COMPONENTS_MESSAGES[IMAGE_COPY_KEY[outcome]], lang);
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('unreadable image'));
  reader.readAsDataURL(blob);
});

/** How long a finished `print()` call keeps blocking the next print when the browser never reports `afterprint`. */
const PRINT_GUARD_MS = 60_000;
let printBusyUntil = 0;

export function imagePrintFailedText(lang: Lang): string {
  return formatText(COMPONENTS_MESSAGES.chartPrintFailed, lang);
}

/**
 * Prints one PNG under its title from a hidden iframe, so the page itself needs no print stylesheet. The image goes in as `data:` because the
 * production CSP's `img-src` has no `blob:`; the title is set as text, never markup. `afterprint` removes the frame. A browser that never fires it
 * leaves one hidden frame, which the first print after `PRINT_GUARD_MS` replaces. One print at a time across all charts: a request while another is
 * capturing or its print UI may be open is ignored, because some browsers return from `print()` with the UI still open and removing the frame would
 * cancel it. `false` = a request that was not ignored sent nothing to print.
 */
export async function printChartImage(produce: () => Blob | Promise<Blob>, title: string): Promise<boolean> {
  if (Date.now() < printBusyUntil) return true;
  printBusyUntil = Infinity;
  document.querySelectorAll('iframe[data-chart-print]').forEach(old => old.remove());
  let frame: HTMLIFrameElement | null = null;
  try {
    const src = await blobToDataUrl(await produce());
    const created = document.createElement('iframe');
    frame = created;
    created.dataset.chartPrint = ''; created.setAttribute('aria-hidden', 'true'); created.tabIndex = -1;
    created.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.append(created);
    const win = created.contentWindow; const doc = created.contentDocument;
    if (!win || !doc) throw new Error('no print frame');
    const heading = doc.createElement('h1');
    heading.textContent = title; heading.style.cssText = 'font:600 14px sans-serif;margin:0 0 8px';
    const image = doc.createElement('img');
    image.alt = title; image.style.cssText = 'display:block;max-width:100%;max-height:90vh';
    doc.body.append(heading, image);
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error('image failed'));
      image.src = src;
    });
    win.addEventListener('afterprint', () => { created.remove(); printBusyUntil = 0; }, { once: true });
    win.focus(); win.print();
    if (created.isConnected) printBusyUntil = Date.now() + PRINT_GUARD_MS;
    return true;
  } catch {
    frame?.remove();
    printBusyUntil = 0;
    return false;
  }
}

/** `data:` URL to Blob without `fetch`: a CSP may block `data:` fetches. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(5, comma);
  const type = head.split(';')[0] || 'image/png';
  const body = dataUrl.slice(comma + 1);
  if (!head.endsWith(';base64')) return new Blob([decodeURIComponent(body)], { type });
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let n = 0; n < bytes.length; n++) out[n] = bytes.charCodeAt(n);
  return new Blob([out], { type });
}

/** The chart as PNG at 2× on the current surface colour; the toolbox is left out. */
export function echartImageBlob(instance: ECharts | null): Blob {
  if (!instance || instance.isDisposed?.()) throw new Error('chart is not ready');
  return dataUrlToBlob(instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: readColorToken('surface-card'), excludeComponents: ['toolbox'] }));
}

const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('empty canvas'))), 'image/png'));

/**
 * LaneTimeline: the axis canvas over the data canvas and the overlay canvas (the visible range, backing-store pixels) on the surface colour. The lane names are DOM,
 * not canvas, so they are drawn into the left gutter from the label cells at their scrolled positions.
 */
export function laneImageBlob(parts: { axis: HTMLCanvasElement | null; plot: HTMLCanvasElement | null; overlay?: HTMLCanvasElement | null; labels: HTMLElement | null; scroll: HTMLElement | null }): Promise<Blob> {
  const { axis, plot, overlay, labels, scroll } = parts;
  if (!axis || !plot) return Promise.reject(new Error('timeline is not ready'));
  const out = document.createElement('canvas');
  out.width = Math.max(axis.width, plot.width); out.height = axis.height + plot.height;
  const ctx = out.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no canvas context'));
  ctx.fillStyle = readColorToken('surface-card'); ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(axis, 0, 0); ctx.drawImage(plot, 0, axis.height);
  if (overlay) ctx.drawImage(overlay, 0, axis.height); // selection layer; transient hover is never drawn on a canvas
  if (labels && scroll) {
    const ratio = plot.clientWidth ? plot.width / plot.clientWidth : 1;
    const style = getComputedStyle(labels);
    // The scroller clips a partly visible row on screen; the copy must not spill it into the axis strip.
    ctx.save(); ctx.beginPath(); ctx.rect(0, axis.height, out.width, Math.min(plot.height, scroll.clientHeight * ratio)); ctx.clip();
    ctx.fillStyle = chartTheme().axisLabel.color; ctx.font = `${12 * ratio}px ${style.fontFamily}`; ctx.textBaseline = 'middle';
    for (const cell of Array.from(labels.children) as HTMLElement[]) {
      const top = cell.offsetTop - scroll.scrollTop;
      if (top + cell.offsetHeight < 0 || top > scroll.clientHeight) continue;
      ctx.fillText(cell.textContent ?? '', 8 * ratio, axis.height + (top + cell.offsetHeight / 2) * ratio, Math.max(0, cell.offsetWidth - 16) * ratio);
    }
    ctx.restore();
  }
  return canvasBlob(out);
}
