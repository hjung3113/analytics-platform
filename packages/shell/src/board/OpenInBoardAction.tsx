import { useState } from 'react';
import { BOARD_PATH, useI18n, usePlatform, type PaneScreen } from '@ap/kernel';
import { useHeaderOverflowDialog, type HeaderOverflowDialogControl } from '@ap/components';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, RadioGroup, RadioGroupItem,
} from '@ap/ui';
import { MAX_SHEETS, openScreenInNewSheet, setPane, type Board } from './boardModel';
import { readStoredBoard, writeStoredBoard } from './boardStore';
import { boardText } from './text';

type Destination = 'new' | 'empty' | 'replace';

/** The current screen as a pane screen: this menu, its route params and the address's Context and page keys. */
function useCurrentScreen(): PaneScreen | null {
  const { route, url } = usePlatform();
  if (!route) return null;
  const at = url.indexOf('?');
  return { menuId: route.menu.id, params: { ...route.params }, query: at === -1 ? '' : url.slice(at) };
}

/**
 * `분석 보드에 열기…` (docs/16 §6): the item the app puts in a board menu's `⋯` page menu (`PlatformSlots.boardEntry`). It only hands
 * its dialog to the header, which keeps it mounted after the menu closes. Nothing is stored until the user confirms.
 */
export function OpenInBoardAction() {
  const { lang } = useI18n();
  const show = useHeaderOverflowDialog();
  return <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => show?.(control => <OpenInBoardDialog control={control} />)}>
    {boardText(lang).openInBoard}
  </Button>;
}

function OpenInBoardDialog({ control }: { control: HeaderOverflowDialogControl }) {
  const { user, navigate, registry } = usePlatform();
  const { lang, tx } = useI18n();
  const text = boardText(lang);
  const screen = useCurrentScreen();
  const menuName = (menuId: string) => { const menu = registry.menus.find(m => m.id === menuId); return menu ? tx(menu.label) : menuId; };
  // Read once when the dialog opens; the confirm re-reads, so a board changed in another tab is never overwritten with stale data.
  const [board] = useState<Board>(() => readStoredBoard(user.id, text.sheetPrefix));
  const full = board.sheets.length >= MAX_SHEETS;
  const withEmpty = board.sheets.filter(s => s.panes.some(p => p === null));
  const [destination, setDestination] = useState<Destination>(() => (full ? (withEmpty.length > 0 ? 'empty' : 'replace') : 'new'));
  const [sheetId, setSheetId] = useState<string>('');
  const [paneIndex, setPaneIndex] = useState<number | null>(null);
  const sheetChoices = destination === 'empty' ? withEmpty : board.sheets;
  const sheet = sheetChoices.find(s => s.id === sheetId) ?? null;
  const paneChoices = sheet ? sheet.panes.map((pane, index) => ({ pane, index })).filter(({ pane }) => (destination === 'empty') === (pane === null)) : [];
  const ready = destination === 'new' ? !full : sheet !== null && paneIndex !== null && paneChoices.some(c => c.index === paneIndex);

  const confirm = () => {
    if (!screen || !ready) return;
    const current = readStoredBoard(user.id, text.sheetPrefix);
    let next: Board | null;
    if (destination === 'new') next = openScreenInNewSheet(current, text.sheetPrefix, screen);
    else if (paneIndex !== null && sheet && current.sheets.some(s => s.id === sheet.id)) next = { ...setPane(current, sheet.id, paneIndex, screen), activeSheetId: sheet.id };
    else next = null;
    if (!next) return;
    writeStoredBoard(user.id, next);
    control.close();
    navigate(`${BOARD_PATH}?sheet=${encodeURIComponent(next.activeSheetId)}`, { focus: 'page' });
  };
  const pick = (value: string) => { setDestination(value as Destination); setSheetId(''); setPaneIndex(null); };

  return <Dialog open onOpenChange={open => { if (!open) control.close(); }}>
    <DialogContent closeLabel={lang === 'ko' ? '닫기' : 'Close'} onCloseAutoFocus={control.onCloseAutoFocus} className="max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{text.openInBoardTitle}</DialogTitle>
        <DialogDescription>{text.openInBoardBody}</DialogDescription>
      </DialogHeader>
      <RadioGroup aria-label={text.destination} value={destination} onValueChange={pick}>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="board-dest-new" value="new" disabled={full} aria-describedby={full ? 'board-dest-new-off' : undefined} />
          <Label htmlFor="board-dest-new">{text.destNew}</Label>
          {full && <span id="board-dest-new-off" className="text-tiny text-text-muted">{text.maxSheets}</span>}
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="board-dest-empty" value="empty" disabled={withEmpty.length === 0} aria-describedby={withEmpty.length === 0 ? 'board-dest-empty-off' : undefined} />
          <Label htmlFor="board-dest-empty">{text.destEmpty}</Label>
          {withEmpty.length === 0 && <span id="board-dest-empty-off" className="text-tiny text-text-muted">{text.noEmptyPane}</span>}
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="board-dest-replace" value="replace" />
          <Label htmlFor="board-dest-replace">{text.destReplace}</Label>
        </div>
      </RadioGroup>
      {destination !== 'new' && <div className="grid gap-3">
        <fieldset className="grid gap-1">
          <legend className="text-tiny font-semibold text-text-secondary">{text.destSheet}</legend>
          <RadioGroup aria-label={text.destSheet} value={sheetId} onValueChange={id => { setSheetId(id); setPaneIndex(null); }} spacing="compact" className="max-h-40 overflow-y-auto">
            {sheetChoices.map(s => <div key={s.id} className="flex items-center gap-2">
              <RadioGroupItem id={`board-sheet-${s.id}`} value={s.id} />
              <Label htmlFor={`board-sheet-${s.id}`}>{s.name}</Label>
            </div>)}
          </RadioGroup>
        </fieldset>
        {sheet && <fieldset className="grid gap-1">
          <legend className="text-tiny font-semibold text-text-secondary">{text.destPane}</legend>
          <RadioGroup aria-label={text.destPane} value={paneIndex === null ? '' : String(paneIndex)} onValueChange={value => setPaneIndex(Number(value))} spacing="compact">
            {paneChoices.map(({ pane, index }) => <div key={index} className="flex items-center gap-2">
              <RadioGroupItem id={`board-pane-${index}`} value={String(index)} />
              <Label htmlFor={`board-pane-${index}`}>{text.paneOption(index + 1, pane === null ? null : menuName(pane.menuId))}</Label>
            </div>)}
          </RadioGroup>
        </fieldset>}
        {destination === 'replace' && sheet && paneIndex !== null && <p role="status" className="text-sm text-text-primary">{text.confirmReplace(paneIndex + 1)}</p>}
      </div>}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={control.close}>{text.cancel}</Button>
        <Button type="button" disabled={!ready} onClick={confirm}>{text.openAction}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
