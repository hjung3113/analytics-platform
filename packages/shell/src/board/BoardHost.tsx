import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { FLOATING_MIN_SIZE, FloatingWindow, fitsArea, type FloatingArea, type FloatingGeometry, type FloatingWindowHandle } from '@ap/components';
import { Button } from '@ap/ui';
import { BoardScreen } from './BoardScreen';
import { registerWindowFocus, rememberWindowFill, takeDisplayFocus, useBoardPresentation } from './boardPresentation';
import { boardText } from './text';
import { WINDOW_NARROW_BELOW, fillArea, windowArea } from './windowLayout';

const NO_AREA: FloatingArea = { left: 0, top: 0, width: 0, height: 0 };
/** Where the ordinary screen's page header ends inside the area box (0 when the screen draws none): a window never covers it. */
const pageHeaderBottom = (container: HTMLElement): number => {
  const header = container.querySelector('[data-page-sticky-header] > header');
  return header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom - container.getBoundingClientRect().top)) : 0;
};
/** The first window of a user: 60% × 70% of the area, nearly centred (prototype A). Computed here, in the lazy chunk, never stored. */
const defaultGeometry = (area: FloatingArea): FloatingGeometry => ({ x: Math.round(area.width * 0.2), y: Math.round(area.height * 0.12), width: Math.round(area.width * 0.6), height: Math.round(area.height * 0.7) });

/**
 * The one mount of the analysis board (ADR-0087, ADR-0091). `FloatingWindow` stays at this place in every display — `off` for maximized and minimized,
 * `window`, or `fill` where main is too narrow for a window — and the board is its child, so a mode change never remounts it. The window's area is the
 * positioned container around `main` (`data-board-window-area`), minus the strip a toast can cover.
 */
export function BoardHost({ Outlet, display }: { Outlet: ComponentType; display: 'maximized' | 'window' | 'minimized' }) {
  const { user } = useHostPlatform();
  const { lang } = useI18n();
  const text = useMemo(() => boardText(lang), [lang]);
  const board = useBoardPresentation();
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<FloatingWindowHandle>(null);
  const titleId = useId();
  // The measured box and where the page header ends; the window's own area and the `fill` area both derive from them.
  const [box, setBox] = useState({ width: 0, height: 0, header: 0 });

  // Only a window needs the area: no observer while the board is maximized or minimized.
  const windowed = display === 'window';
  useLayoutEffect(() => {
    if (!windowed) return;
    const container = host.current?.closest<HTMLElement>('[data-board-window-area]') ?? null;
    if (!container) return;
    const measure = () => {
      const next = { width: container.clientWidth, height: container.clientHeight, header: pageHeaderBottom(container) };
      setBox(prev => (prev.width === next.width && prev.height === next.height && prev.header === next.header ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    // Another screen behind the window brings its own page header (or none).
    let pending = 0;
    const mutations = new MutationObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(measure); });
    mutations.observe(container, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(pending); };
  }, [windowed]);

  const windowBox = windowArea(box.width, box.height, box.header);
  const narrow = display === 'window' && !fitsArea(windowBox, FLOATING_MIN_SIZE, WINDOW_NARROW_BELOW);
  // `fill` is the maximized display: the whole box, no page header or toast band kept clear (the board covers the page like the maximized one).
  const area: FloatingArea = display === 'window' ? (narrow ? fillArea(box.width, box.height) : windowBox) : NO_AREA;
  const mode = display === 'window' ? (narrow ? 'fill' : 'window') : 'off';
  // The rail's "bring forward" lands on the title bar; where the frame draws none (`fill`) it lands on the board's own heading. Read through a ref so the
  // registered callback sees the display of the moment it is called, not the one of the render that registered it.
  useEffect(() => { rememberWindowFill(user.id, mode === 'fill'); }, [mode, user.id]);
  const modeNow = useRef(mode);
  useEffect(() => { modeNow.current = mode; }, [mode]);
  const focusHeading = () => { host.current?.querySelector<HTMLElement>('[data-board-heading]')?.focus({ preventScroll: true }); };
  useEffect(() => registerWindowFocus(user.id, () => {
    if (modeNow.current === 'window') frame.current?.focusTitleBar();
    else focusHeading();
  }), [user.id]);
  // `창으로 보기` and window `최대화` unmount the pressed button: once the new display is on screen focus goes to its title bar / the board heading.
  // A window waits for its first measured area (before it the frame is still `fill` and has no title bar).
  useEffect(() => {
    if (display === 'window' && area.width > 0 && takeDisplayFocus(user.id, 'window')) {
      if (modeNow.current === 'window') frame.current?.focusTitleBar();
      else focusHeading();
    } else if (display === 'maximized' && takeDisplayFocus(user.id, 'maximized')) focusHeading();
  }, [display, mode, area.width, user.id]);
  const shown = display !== 'minimized';
  return <FloatingWindow ref={frame} area={area} geometry={board.geometry ?? defaultGeometry(area)} onGeometryChange={board.setGeometry} mode={mode}
    title={text.windowTitle(board.sheetName)} titleId={titleId} labels={text.window}
    actions={<div className="flex shrink-0 items-center gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => { board.minimize(text.announceMinimized); }}><Minus className="size-3.5" aria-hidden />{text.minimize}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => { board.maximize(text.announceMaximized); }}><Square className="size-3.5" aria-hidden />{text.maximize}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => { board.close(text.announceClosed); }}><X className="size-3.5" aria-hidden />{text.closeBoard}</Button>
    </div>}>
    <div ref={host} data-board-host data-board-display={display === 'window' ? mode : display} hidden={!shown} inert={!shown} aria-hidden={shown ? undefined : true} className="flex h-full min-h-0 flex-col">
      {narrow && <p data-board-narrow-note role="note" className="shrink-0 border-b border-border-subtle bg-surface-sunken px-3 py-1 text-xs text-text-secondary">{text.narrowNote}</p>}
      <div className="min-h-0 flex-1"><BoardScreen Outlet={Outlet} visible={shown} display={display === 'window' ? (narrow ? 'fill' : 'window') : undefined} /></div>
    </div>
  </FloatingWindow>;
}
