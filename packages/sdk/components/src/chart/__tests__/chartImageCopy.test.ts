import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyChartImage, dataUrlToBlob, echartImageBlob, imageCopyText, laneImageBlob, printChartImage } from '../chartImageCopy';
import { waitFor } from '@testing-library/react';

const png = () => new Blob(['png'], { type: 'image/png' });
class FakeClipboardItem { constructor(public readonly items: Record<string, Blob | Promise<Blob>>) {} }
let download: ReturnType<typeof vi.spyOn>;
let create: typeof URL.createObjectURL; let revoke: typeof URL.revokeObjectURL;
let anchorNames: string[];

function env(options: { secure: boolean; write?: (items: FakeClipboardItem[]) => Promise<void> | void }) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: options.secure });
  if (options.secure) {
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: vi.fn(async (items: FakeClipboardItem[]) => options.write?.(items)) } });
  } else {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  }
}
const written = () => (navigator.clipboard.write as unknown as ReturnType<typeof vi.fn>).mock.calls;

beforeEach(() => {
  anchorNames = [];
  create = URL.createObjectURL; revoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:png'; URL.revokeObjectURL = () => {};
  download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { anchorNames.push(this.download); });
});
afterEach(() => { download.mockRestore(); URL.createObjectURL = create; URL.revokeObjectURL = revoke; vi.unstubAllGlobals(); });

describe('copyChartImage (#1657)', () => {
  it('writes a promised image/png ClipboardItem synchronously inside the click and reports copied', async () => {
    env({ secure: true });
    let resolve!: (blob: Blob) => void;
    const result = copyChartImage(() => new Promise<Blob>(r => { resolve = r; }), 'a.png');
    // Before any await: the write already started with the promise, not a settled blob.
    expect(written()).toHaveLength(1);
    const item = written()[0][0][0] as FakeClipboardItem;
    expect(item.items['image/png']).toBeInstanceOf(Promise);
    resolve(png());
    await expect(result).resolves.toBe('copied');
    expect(anchorNames).toEqual([]);
  });

  it('downloads the PNG outside a secure context', async () => {
    env({ secure: false });
    await expect(copyChartImage(png, 'chart.png')).resolves.toBe('downloaded');
    expect(anchorNames).toEqual(['chart.png']);
  });

  it('downloads when the clipboard write is rejected', async () => {
    env({ secure: true, write: () => Promise.reject(new DOMException('no', 'NotAllowedError')) });
    await expect(copyChartImage(png, 'chart.png')).resolves.toBe('downloaded');
    expect(anchorNames).toEqual(['chart.png']);
  });

  it('downloads when ClipboardItem refuses promised values synchronously', async () => {
    env({ secure: true });
    vi.stubGlobal('ClipboardItem', class { constructor() { throw new TypeError('no promises'); } });
    await expect(copyChartImage(png, 'chart.png')).resolves.toBe('downloaded');
  });

  it('fails when the image cannot be produced or neither path works', async () => {
    env({ secure: true });
    await expect(copyChartImage(() => { throw new Error('not ready'); }, 'x.png')).resolves.toBe('failed');
    env({ secure: true, write: () => Promise.reject(new Error('no')) });
    await expect(copyChartImage(() => Promise.reject(new Error('empty')), 'x.png')).resolves.toBe('failed');
    expect(anchorNames).toEqual([]);
  });

  it('words each outcome in both languages', () => {
    expect(['copied', 'downloaded', 'failed'].map(o => imageCopyText(o as 'copied', 'ko'))).toEqual(['이미지를 복사했습니다', '이미지를 내려받았습니다', '이미지를 복사하거나 내려받지 못했습니다']);
    expect(imageCopyText('copied', 'en')).toBe('Image copied');
    expect(imageCopyText('downloaded', 'en')).toBe('Image downloaded');
  });
});

describe('image sources (#1657)', () => {
  it('turns a base64 data URL into a PNG blob without fetch', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const blob = dataUrlToBlob(`data:image/png;base64,${btoa('hello')}`);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks ECharts for a 2x PNG on the surface colour without the toolbox', () => {
    const getDataURL = vi.fn(() => `data:image/png;base64,${btoa('x')}`);
    echartImageBlob({ getDataURL, isDisposed: () => false } as never);
    expect(getDataURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'png', pixelRatio: 2, excludeComponents: ['toolbox'], backgroundColor: expect.any(String) }));
    expect(() => echartImageBlob(null)).toThrow();
  });

  it('composites the axis over the plot in backing-store pixels on a surface background', async () => {
    const calls: unknown[][] = [];
    const ctx = { fillRect: (...a: unknown[]) => calls.push(['fillRect', ...a]), drawImage: (...a: unknown[]) => calls.push(['drawImage', ...a]), fillText: vi.fn(), set fillStyle(_: string) {}, set font(_: string) {}, set textBaseline(_: string) {} };
    const original = document.createElement.bind(document);
    let out: HTMLCanvasElement | null = null;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = original(tag);
      if (tag === 'canvas') { out = el as HTMLCanvasElement; vi.spyOn(out, 'getContext').mockReturnValue(ctx as never); out.toBlob = cb => cb(png()); }
      return el;
    });
    const axis = original('canvas'); axis.width = 1200; axis.height = 60;
    const plot = original('canvas'); plot.width = 1200; plot.height = 400;
    await expect(laneImageBlob({ axis, plot, labels: null, scroll: null })).resolves.toBeInstanceOf(Blob);
    expect(out!.width).toBe(1200); expect(out!.height).toBe(460);
    expect(calls[0]).toEqual(['fillRect', 0, 0, 1200, 460]);
    expect(calls.slice(1)).toEqual([['drawImage', axis, 0, 0], ['drawImage', plot, 0, 60]]);
    vi.restoreAllMocks();
  });

  it('clips lane labels to the visible plot so a partly scrolled row stays out of the axis strip', async () => {
    const order: unknown[][] = [];
    const ctx = { fillRect: () => {}, drawImage: () => {}, save: () => order.push(['save']), beginPath: () => {}, rect: (...a: unknown[]) => order.push(['rect', ...a]), clip: () => order.push(['clip']), restore: () => order.push(['restore']), fillText: (...a: unknown[]) => order.push(['fillText', ...a]), set fillStyle(_: string) {}, set font(_: string) {}, set textBaseline(_: string) {} };
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = original(tag);
      if (tag === 'canvas') { vi.spyOn(el as HTMLCanvasElement, 'getContext').mockReturnValue(ctx as never); (el as HTMLCanvasElement).toBlob = cb => cb(png()); }
      return el;
    });
    const axis = original('canvas'); axis.width = 1200; axis.height = 80;
    const plot = original('canvas'); plot.width = 1200; plot.height = 800;
    Object.defineProperty(plot, 'clientWidth', { value: 600 });
    const labels = original('div');
    const cell = original('div'); cell.textContent = 'Lane A'; labels.append(cell);
    Object.defineProperties(cell, { offsetTop: { value: 0 }, offsetHeight: { value: 24 }, offsetWidth: { value: 112 } });
    const scroll = original('div');
    Object.defineProperty(scroll, 'clientHeight', { value: 300 }); scroll.scrollTop = 20;
    await laneImageBlob({ axis, plot, labels, scroll });
    expect(order.map(c => c[0])).toEqual(['save', 'rect', 'clip', 'fillText', 'restore']);
    expect(order[1]).toEqual(['rect', 0, 80, 1200, 600]);
    vi.restoreAllMocks();
  });
});

describe('printChartImage (#1665)', () => {
  const printFrame = () => document.querySelector<HTMLIFrameElement>('iframe[data-chart-print]');
  afterEach(() => { document.querySelectorAll('iframe[data-chart-print]').forEach(frame => frame.remove()); });
  async function loaded() {
    await waitFor(() => expect(printFrame()?.contentDocument?.querySelector('img')).toBeTruthy());
    const frame = printFrame()!;
    const print = vi.fn();
    frame.contentWindow!.print = print;
    frame.contentWindow!.focus = vi.fn();
    return { frame, print, image: frame.contentDocument!.querySelector('img')! };
  }

  it('prints a titled data: image (the production CSP refuses blob: images) only after the image loaded', async () => {
    const done = printChartImage(() => png(), '<b>Cycle</b>');
    const { frame, print, image } = await loaded();
    expect(image.src.startsWith('data:image/png;base64,')).toBe(true);
    expect(frame.contentDocument!.querySelector('h1')!.textContent).toBe('<b>Cycle</b>');
    expect(frame.contentDocument!.querySelector('b')).toBeNull();
    expect(print).not.toHaveBeenCalled();
    image.dispatchEvent(new Event('load'));
    await expect(done).resolves.toBe(true);
    expect(print).toHaveBeenCalledOnce();
  });

  it('removes the frame after printing, and a later print replaces a frame that never got afterprint', async () => {
    const first = printChartImage(() => png(), 'A');
    const one = await loaded();
    one.image.dispatchEvent(new Event('load'));
    await first;
    const second = printChartImage(() => png(), 'B');
    await waitFor(() => expect(printFrame()).not.toBe(one.frame));
    const two = await loaded();
    expect(document.querySelectorAll('iframe[data-chart-print]')).toHaveLength(1);
    two.image.dispatchEvent(new Event('load'));
    await second;
    two.frame.contentWindow!.dispatchEvent(new Event('afterprint'));
    expect(printFrame()).toBeNull();
  });

  it('reports failure and leaves no frame when the capture throws or the image fails', async () => {
    await expect(printChartImage(() => { throw new Error('not ready'); }, 'A')).resolves.toBe(false);
    expect(printFrame()).toBeNull();
    const done = printChartImage(() => png(), 'A');
    const { image, print } = await loaded();
    image.dispatchEvent(new Event('error'));
    await expect(done).resolves.toBe(false);
    expect(print).not.toHaveBeenCalled();
    expect(printFrame()).toBeNull();
  });
});
