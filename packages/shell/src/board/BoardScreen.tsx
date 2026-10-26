import { useEffect, useMemo, type ComponentType } from 'react';
import { useI18n } from '@ap/kernel';
import { BOARD_PATH, useHostPlatform } from '@ap/kernel/host';
import { BoardSurface } from './BoardSurface';
import { setActiveSheet } from './boardModel';
import { useBoardSession } from './boardSession';
import { boardText } from './text';

const sheetHref = (id: string) => `${BOARD_PATH}?sheet=${encodeURIComponent(id)}`;

/**
 * The analysis board as a platform screen at `/board?sheet=<id>` (docs/16), not a Registry menu: the URL adapter around `BoardSurface`. The address
 * carries only the sheet; this reads it, names the sheet on screen, and turns the surface's sheet changes into address changes.
 */
export function BoardScreen({ Outlet }: { Outlet: ComponentType }) {
  const { user, url, navigate } = useHostPlatform();
  const { lang } = useI18n();
  const text = useMemo(() => boardText(lang), [lang]);
  const { board, update } = useBoardSession(user.id, text.sheetPrefix);

  const requested = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?')) : '').get('sheet');
  const matched = board.sheets.find(s => s.id === requested) ?? null;
  const sheet = matched ?? board.sheets.find(s => s.id === board.activeSheetId) ?? board.sheets[0];

  // The URL names the sheet on screen; an unknown or missing one falls back to the stored active sheet (a replace, no history entry).
  useEffect(() => {
    if (matched) { if (board.activeSheetId !== matched.id) update(b => setActiveSheet(b, matched.id)); return; }
    navigate(sheetHref(sheet.id), { replace: true });
  }, [matched, board.activeSheetId, sheet.id, update, navigate]);

  return <BoardSurface sheetId={sheet.id} arrivalKey={url} Outlet={Outlet}
    onSheetChange={(id, options) => { if (options?.replace) navigate(sheetHref(id), { replace: true }); else navigate(sheetHref(id)); }} />;
}
