import { useState } from 'react';
import { useI18n } from '@ap/kernel';
import { BOARD_PATH, useHostPlatform, type PaneScreen } from '@ap/kernel/host';
import { useHeaderOverflowDialog, type HeaderOverflowDialogControl } from '@ap/components';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, RadioGroup, RadioGroupItem,
} from '@ap/ui';
import { MAX_SHEETS, openScreenInNewSheet, samePane, setPane, type Board } from './boardModel';
import { readBoardSession, reloadBoardSession, updateBoardSession } from './boardSession';
import { boardText } from './text';

type Destination = 'new' | 'empty' | 'replace';

/** The current screen as a pane screen: this menu, its route params and the address's Context and page keys. */
function useCurrentScreen(): PaneScreen | null {
  const { route, url } = useHostPlatform();
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

/** The dialog belongs to the signed-in user: another user gets a fresh one, so the previous user's sheets are never shown. */
function OpenInBoardDialog({ control }: { control: HeaderOverflowDialogControl }) {
  const { user } = useHostPlatform();
  return <OpenInBoardDialogBody key={user.id} control={control} />;
}

const initialDestination = (board: Board): Destination => (board.sheets.length >= MAX_SHEETS ? (board.sheets.some(s => s.panes.some(p => p.screen === null)) ? 'empty' : 'replace') : 'new');

function OpenInBoardDialogBody({ control }: { control: HeaderOverflowDialogControl }) {
  const { user, navigate, registry } = useHostPlatform();
  const { lang, tx } = useI18n();
  const text = boardText(lang);
  const screen = useCurrentScreen();
  const menuName = (menuId: string) => { const menu = registry.menus.find(m => m.id === menuId); return menu ? tx(menu.label) : menuId; };
  // Read when the dialog opens; the confirm re-reads and checks the chosen target again, so a board changed in another tab is never overwritten with stale data.
  const [board, setBoard] = useState<Board>(() => readBoardSession(user.id, text.sheetPrefix).board);
  const full = board.sheets.length >= MAX_SHEETS;
  const withEmpty = board.sheets.filter(s => s.panes.some(p => p.screen === null));
  const [destination, setDestination] = useState<Destination>(() => initialDestination(board));
  const [problem, setProblem] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string>('');
  const [paneIndex, setPaneIndex] = useState<number | null>(null);
  const sheetChoices = destination === 'empty' ? withEmpty : board.sheets;
  const sheet = sheetChoices.find(s => s.id === sheetId) ?? null;
  const paneChoices = sheet ? sheet.panes.map((slot, index) => ({ pane: slot.screen, index })).filter(({ pane }) => (destination === 'empty') === (pane === null)) : [];
  const ready = destination === 'new' ? !full : sheet !== null && paneIndex !== null && paneChoices.some(c => c.index === paneIndex);

  const confirm = () => {
    if (!screen || !ready) return;
    // The one session the board screen uses; a change made in another tab is taken in first, and the check, the change and the save are one update.
    reloadBoardSession(user.id, text.sheetPrefix);
    // A board from a newer build is never written: say so before judging the destination, which that board cannot contain.
    const held = readBoardSession(user.id, text.sheetPrefix);
    if (held.readOnly) { setProblem(text.boardNotSaved); return; }
    // Moves still only in memory (a splitter drag) are never written over what another tab saved meanwhile: that is a conflict, not a retry-able pane change.
    if (held.unsaved) { setProblem(text.boardBusy); return; }
    const run: { current: Board | null; next: Board | null } = { current: null, next: null };
    const after = updateBoardSession(user.id, text.sheetPrefix, held => {
      run.current = held;
      if (destination === 'new') run.next = openScreenInNewSheet(held, text.sheetPrefix, screen);
      else if (paneIndex !== null && sheet) {
        // The pane the user was shown must still be what they chose: empty for 빈 칸, the same screen for 바꾸기.
        const live = held.sheets.find(s => s.id === sheet.id)?.panes[paneIndex]?.screen;
        const shown = sheet.panes[paneIndex]?.screen ?? null;
        const unchanged = live !== undefined && (destination === 'empty' ? live === null : live !== null && samePane(live, shown));
        if (unchanged) run.next = { ...setPane(held, sheet.id, paneIndex, screen), activeSheetId: sheet.id };
      }
      return run.next ?? held;
    });
    const { current, next } = run;
    if (!next || !current) {
      setBoard(current ?? after.board);
      setPaneIndex(null);
      if (destination === 'new') { setDestination(initialDestination(current ?? after.board)); setProblem(text.maxSheets); } else setProblem(text.paneChanged);
      return;
    }
    if (after.readOnly) { setProblem(text.boardNotSaved); return; }
    control.close();
    // The same transition as the rail's open and the chip's restore: a replace, so a board opened from here never adds a history entry.
    navigate(`${BOARD_PATH}?sheet=${encodeURIComponent(next.activeSheetId)}`, { replace: true, focus: 'page', via: 'board' });
  };
  const pick = (value: string) => { setDestination(value as Destination); setSheetId(''); setPaneIndex(null); setProblem(null); };

  return <Dialog open onOpenChange={open => { if (!open) control.close(); }}>
    <DialogContent closeLabel={text.close} onCloseAutoFocus={control.onCloseAutoFocus} className="max-h-[80vh] overflow-y-auto">
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
          <RadioGroup aria-label={text.destSheet} value={sheetId} onValueChange={id => { setSheetId(id); setPaneIndex(null); setProblem(null); }} spacing="compact" className="max-h-40 overflow-y-auto">
            {sheetChoices.map(s => <div key={s.id} className="flex items-center gap-2">
              <RadioGroupItem id={`board-sheet-${s.id}`} value={s.id} />
              <Label htmlFor={`board-sheet-${s.id}`}>{s.name}</Label>
            </div>)}
          </RadioGroup>
        </fieldset>
        {sheet && <fieldset className="grid gap-1">
          <legend className="text-tiny font-semibold text-text-secondary">{text.destPane}</legend>
          <RadioGroup aria-label={text.destPane} value={paneIndex === null ? '' : String(paneIndex)} onValueChange={value => { setPaneIndex(Number(value)); setProblem(null); }} spacing="compact">
            {paneChoices.map(({ pane, index }) => <div key={index} className="flex items-center gap-2">
              <RadioGroupItem id={`board-pane-${index}`} value={String(index)} />
              <Label htmlFor={`board-pane-${index}`}>{text.paneOption(index + 1, pane === null ? null : menuName(pane.menuId))}</Label>
            </div>)}
          </RadioGroup>
        </fieldset>}
        {destination === 'replace' && sheet && paneIndex !== null && <p role="status" className="text-sm text-text-primary">{text.confirmReplace(paneIndex + 1)}</p>}
      </div>}
      {problem !== null && <p role="alert" className="text-sm text-text-danger-label">{problem}</p>}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={control.close}>{text.cancel}</Button>
        <Button type="button" disabled={!ready} onClick={confirm}>{text.openAction}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
