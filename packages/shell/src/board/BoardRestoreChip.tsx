import { useEffect, useId, useRef } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { Button } from '@ap/ui';
import { takeChipFocus, useBoardPresentation } from './boardPresentation';
import { boardText } from './text';

/**
 * Where a minimized board comes back from (docs/16 §4): one row under the main screen, left-aligned, so the screen above it shrinks by the row's height
 * and its last line is never covered. One button — one Tab stop — named like its visible text (`분석 보드 · <시트 이름>`). Closing the board is done
 * from the restored board's header. The polite status region is persistent, so a transition is said once; it sits here because this is what the user
 * is looking at (or has just left) when the board hides.
 */
export function BoardRestoreChip() {
  const { user } = useHostPlatform();
  const { lang } = useI18n();
  const text = boardText(lang);
  const board = useBoardPresentation();
  const button = useRef<HTMLButtonElement>(null);
  const hint = useId();
  // After the board's own minimize button: focus follows the board to the chip, once it is on screen.
  useEffect(() => {
    if (board.minimized && takeChipFocus(user.id)) button.current?.focus({ preventScroll: true });
  }, [board.minimized, user.id]);
  return <>
    {board.minimized && <div data-board-chip-row className="flex h-11 shrink-0 items-center border-t border-border-subtle bg-surface-canvas px-3">
      <Button ref={button} type="button" variant="secondary" size="sm" aria-describedby={hint} onClick={() => { board.restore(text.announceRestored); }}>
        <LayoutGrid className="size-3.5" aria-hidden />{text.chipLabel(board.sheetName)}
      </Button>
      <span id={hint} className="sr-only">{text.chipHint}</span>
    </div>}
    <div role="status" data-board-status className="sr-only">{board.announcement && <span key={board.announcement.n}>{board.announcement.text}</span>}</div>
  </>;
}
