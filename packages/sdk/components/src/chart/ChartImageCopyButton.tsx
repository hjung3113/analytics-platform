import { useState } from 'react';
import { Image as ImageIcon, Printer } from 'lucide-react';
import { useI18n, useMessages, usePlatformOptional } from '@ap/kernel';
import { Button } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { copyChartImage, imageCopyText, imagePrintFailedText, printChartImage } from './chartImageCopy';

/**
 * Export actions outside a platform (#1953 A; also the `AnalysisChartFrame` CSV, slice C). Read only where there is no `PlatformProvider`: inside one, the menu manifest's `features.export` is the only gate
 * and this is ignored, so a consumer prop never widens a menu's permission. `exportAllowed` defaults to off; `notify` receives the result text
 * (default: a short status line beside the button).
 */
export type ChartExportActionsPolicy = { exportAllowed: boolean; notify?: (text: string, tone?: 'warning') => void };

/** Whether the image/export actions show, and where their result text goes (shared by the chart components; not a public export). */
export function useImageActionGate(standalone: ChartExportActionsPolicy | undefined): { allowed: boolean; say: (text: string, tone?: 'warning') => void; status: string } {
  const platform = usePlatformOptional();
  const [status, setStatus] = useState('');
  if (platform !== null) return { allowed: !!platform.route?.menu.features?.export, say: (text, tone) => { platform.toast(text, tone); }, status: '' };
  const notify = standalone?.notify;
  return { allowed: standalone?.exportAllowed === true, say: notify ?? ((text) => setStatus(text)), status };
}
export const ImageActionStatus = ({ text }: { text: string }) => text === '' ? null : <span role="status" className="t-caption text-text-muted">{text}</span>;

/** `이미지 복사`: drawn under a menu whose manifest enables `features.export` (same gate as Export), or, with no `PlatformProvider`, only when `standalone.exportAllowed` is true. Mount it only when the chart's `imageCopy` is true. */
export function ChartImageCopyButton({ capture, fileName, standalone }: { capture: () => Blob | Promise<Blob>; fileName: string; standalone?: ChartExportActionsPolicy }) {
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const { allowed, say, status } = useImageActionGate(standalone);
  if (!allowed) return null;
  return <><Button variant="ghost" size="toolbar" onClick={() => { void copyChartImage(capture, fileName).then(outcome => say(imageCopyText(outcome, lang), outcome === 'failed' ? 'warning' : undefined)); }}>
    <ImageIcon className="size-3.5" aria-hidden />{m('chartCopyImage')}
  </Button><ImageActionStatus text={status} /></>;
}

/** `인쇄`: the same image and the same gate as `ChartImageCopyButton`. `title` is read on click, so a ReactNode heading can pass its rendered text. */
export function ChartImagePrintButton({ capture, title, standalone }: { capture: () => Blob | Promise<Blob>; title: () => string; standalone?: ChartExportActionsPolicy }) {
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const { allowed, say, status } = useImageActionGate(standalone);
  if (!allowed) return null;
  return <><Button variant="ghost" size="toolbar" onClick={() => { void printChartImage(capture, title()).then(printed => { if (!printed) say(imagePrintFailedText(lang), 'warning'); }); }}>
    <Printer className="size-3.5" aria-hidden />{m('chartPrint')}
  </Button><ImageActionStatus text={status} /></>;
}
