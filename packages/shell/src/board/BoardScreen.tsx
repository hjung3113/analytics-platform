import { useEffect, useMemo, type ComponentType } from 'react';
import { useI18n } from '@ap/kernel';
import { BOARD_PATH, useHostPlatform } from '@ap/kernel/host';
import { BoardSurface } from './BoardSurface';
import { setActiveSheet } from './boardModel';
import { useBoardPresentation } from './boardPresentation';
import { useBoardSession } from './boardSession';
import { boardText } from './text';

const sheetHref = (id: string) => `${BOARD_PATH}?sheet=${encodeURIComponent(id)}`;

/**
 * The analysis board as a platform screen at `/board?sheet=<id>` (docs/16), not a Registry menu: the URL adapter around `BoardSurface`. The address
 * carries only the sheet; this reads it, names the sheet on screen, and turns the surface's sheet changes into address changes. While the board is
 * minimized (`visible` false) the address is an ordinary screen's: the adapter keeps the sheet last shown and writes nothing to the address.
 * `display` (893d2, ADR-0091) is set while the board is shown inside the window frame (`window`) or in its narrow-width replacement (`fill`): it is
 * visible but only the maximized board owns the address, so a window reads no sheet from the address, writes none, and a sheet selection only
 * changes the stored active sheet.
 */
export function BoardScreen({ Outlet, visible = true, display }: { Outlet: ComponentType; visible?: boolean; display?: 'window' | 'fill' }) {
  const { user, url, navigate } = useHostPlatform();
  const { lang } = useI18n();
  const text = useMemo(() => boardText(lang), [lang]);
  const { board, update } = useBoardSession(user.id, text.sheetPrefix);
  const presentation = useBoardPresentation();
  const ownsAddress = visible && display === undefined;
  const commands = { float: () => { presentation.toWindow(text.announceFloated); }, minimize: () => { presentation.minimize(text.announceMinimized); }, close: () => { presentation.close(text.announceClosed); } };

  const requested = ownsAddress ? new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?')) : '').get('sheet') : visible ? board.activeSheetId : presentation.sheetId;
  const matched = board.sheets.find(s => s.id === requested) ?? null;
  const sheet = matched ?? board.sheets.find(s => s.id === board.activeSheetId) ?? board.sheets[0];

  // The URL names the sheet on screen; an unknown or missing one falls back to the stored active sheet (a replace, no history entry).
  // Only the maximized board owns the address: a minimized one or a window must never pull an ordinary path back to `/board`.
  useEffect(() => {
    if (!ownsAddress) return;
    if (matched) { if (board.activeSheetId !== matched.id) update(b => setActiveSheet(b, matched.id)); return; }
    navigate(sheetHref(sheet.id), { replace: true });
  }, [ownsAddress, matched, board.activeSheetId, sheet.id, update, navigate]);

  return <BoardSurface sheetId={sheet.id} arrivalKey={ownsAddress ? url : ''} Outlet={Outlet} visible={visible} windowed={display !== undefined}
    onMinimize={display === 'window' ? undefined : commands.minimize} onClose={display === 'window' ? undefined : commands.close} onFloat={ownsAddress ? commands.float : undefined}
    onSheetChange={(id, options) => { if (!visible) return; if (!ownsAddress) { update(b => setActiveSheet(b, id)); return; } if (options?.replace) navigate(sheetHref(id), { replace: true }); else navigate(sheetHref(id)); }} />;
}
