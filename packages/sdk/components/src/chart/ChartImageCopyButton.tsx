import { Image as ImageIcon, Printer } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { copyChartImage, imageCopyText, imagePrintFailedText, printChartImage } from './chartImageCopy';

/** `이미지 복사`: drawn only under a menu whose manifest enables `features.export` (same gate as Export). Mount it only when the chart's `imageCopy` is true, since it needs a PlatformProvider. */
export function ChartImageCopyButton({ capture, fileName }: { capture: () => Blob | Promise<Blob>; fileName: string }) {
  const { lang } = useI18n();
  const { route, toast } = usePlatform();
  if (!route?.menu.features?.export) return null;
  return <Button variant="ghost" size="toolbar" onClick={() => { void copyChartImage(capture, fileName).then(outcome => toast(imageCopyText(outcome, lang), outcome === 'failed' ? 'warning' : undefined)); }}>
    <ImageIcon className="size-3.5" aria-hidden />{lang === 'ko' ? '이미지 복사' : 'Copy image'}
  </Button>;
}

/** `인쇄`: the same image and the same `features.export` gate as `ChartImageCopyButton`. `title` is read on click, so a ReactNode heading can pass its rendered text. */
export function ChartImagePrintButton({ capture, title }: { capture: () => Blob | Promise<Blob>; title: () => string }) {
  const { lang } = useI18n();
  const { route, toast } = usePlatform();
  if (!route?.menu.features?.export) return null;
  return <Button variant="ghost" size="toolbar" onClick={() => { void printChartImage(capture, title()).then(printed => { if (!printed) toast(imagePrintFailedText(lang), 'warning'); }); }}>
    <Printer className="size-3.5" aria-hidden />{lang === 'ko' ? '인쇄' : 'Print'}
  </Button>;
}
