import type { ECharts } from 'echarts/core';
import { readColorToken } from '@ap/ui/theme';
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

export function imageCopyText(outcome: ImageCopyOutcome, lang: string): string {
  const ko = lang === 'ko';
  return outcome === 'copied' ? (ko ? '이미지를 복사했습니다' : 'Image copied')
    : outcome === 'downloaded' ? (ko ? '이미지를 내려받았습니다' : 'Image downloaded')
    : (ko ? '이미지를 복사하거나 내려받지 못했습니다' : 'Could not copy or download the image');
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
 * LaneTimeline: the axis canvas over the plot canvas (the visible range, backing-store pixels) on the surface colour. The lane names are DOM,
 * not canvas, so they are drawn into the left gutter from the label cells at their scrolled positions. The renderer's draw path is untouched.
 */
export function laneImageBlob(parts: { axis: HTMLCanvasElement | null; plot: HTMLCanvasElement | null; labels: HTMLElement | null; scroll: HTMLElement | null }): Promise<Blob> {
  const { axis, plot, labels, scroll } = parts;
  if (!axis || !plot) return Promise.reject(new Error('timeline is not ready'));
  const out = document.createElement('canvas');
  out.width = Math.max(axis.width, plot.width); out.height = axis.height + plot.height;
  const ctx = out.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no canvas context'));
  ctx.fillStyle = readColorToken('surface-card'); ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(axis, 0, 0); ctx.drawImage(plot, 0, axis.height);
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
