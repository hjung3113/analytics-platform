import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '@ap/kernel';
import { Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, useSurfacePaused } from '@ap/ui';
import { MAX_SHEETS, type Sheet } from './boardModel';
import { boardText } from './text';

export type SheetTabsProps = {
  sheets: readonly Sheet[];
  /** The sheet on screen. */
  activeId: string;
  panelId: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onDelete: (id: string) => void;
  /** `이 시트 조건을 다른 시트에 복사`: the active sheet's pane Contexts onto the same-numbered panes of `targetId`. */
  onCopyContext: (targetId: string) => void;
};

/**
 * The sheet strip (docs/16 §4): 40px + a 1px top border at the bottom of the main column, outside the page content. Tabs only
 * switch; add, rename, reorder and delete live in the controls beside the tablist, so no button sits inside a tab. ←/→ move focus
 * between tabs, Enter/Space opens one (a sheet switch is a history entry and mounts its panes, so focus alone does not switch).
 */
export function SheetTabs({ sheets, activeId, panelId, onSwitch, onAdd, onRename, onMove, onDelete, onCopyContext }: SheetTabsProps) {
  const { lang } = useI18n();
  const text = boardText(lang);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // A tab drag cannot finish on a covered board.
  const paused = useSurfacePaused();
  if (paused && dragging !== null) setDragging(null);
  const list = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);
  const renameNext = useRef(false);
  const afterComposition = useRef(false);
  const active = sheets.find(s => s.id === activeId) ?? sheets[0];
  const activeIndex = sheets.findIndex(s => s.id === active.id);
  const full = sheets.length >= MAX_SHEETS;
  const tabs = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);

  useEffect(() => {
    if (editing !== null || refocus.current === null) return;
    const id = refocus.current;
    refocus.current = null;
    tabs().find(tab => tab.dataset.sheetId === id)?.focus();
  }, [editing]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = tabs();
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    const target = event.key === 'ArrowRight' ? items[(at + 1) % items.length]
      : event.key === 'ArrowLeft' ? items[(at - 1 + items.length) % items.length]
        : event.key === 'Home' ? items[0] : event.key === 'End' ? items[items.length - 1] : null;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  const commit = (id: string, name: string) => { refocus.current = id; onRename(id, name); setEditing(null); };

  return <div data-board-sheet-strip className="flex h-[41px] shrink-0 items-stretch border-t border-border-subtle bg-surface-sidebar">
    <div ref={list} role="tablist" aria-label={text.sheets} onKeyDown={onKeyDown} className="flex min-w-0 items-stretch overflow-x-auto">
      {sheets.map(sheet => sheet.id === editing
        ? <input key={sheet.id} autoFocus aria-label={text.renameField} defaultValue={sheet.name} maxLength={40}
          onFocus={event => event.currentTarget.select()}
          onCompositionStart={() => { afterComposition.current = false; }}
          // Safari fires the confirming Enter after compositionend with isComposing already false; swallow that one, then release.
          onCompositionEnd={() => { afterComposition.current = true; requestAnimationFrame(() => { afterComposition.current = false; }); }}
          onKeyDown={event => {
            const composing = event.nativeEvent.isComposing || event.keyCode === 229 || afterComposition.current;
            afterComposition.current = false;
            if (composing) return;
            if (event.key === 'Enter') { event.preventDefault(); commit(sheet.id, event.currentTarget.value); }
            else if (event.key === 'Escape') { event.preventDefault(); refocus.current = sheet.id; setEditing(null); }
          }}
          onBlur={event => { if (editing === sheet.id) commit(sheet.id, event.currentTarget.value); }}
          className="my-1 w-36 shrink-0 rounded-sm border border-border-control bg-surface-card px-2 text-sm" />
        : <button key={sheet.id} type="button" role="tab" id={`board-tab-${sheet.id}`} data-sheet-id={sheet.id} aria-selected={sheet.id === active.id} aria-controls={panelId}
          tabIndex={sheet.id === active.id ? 0 : -1} draggable
          onClick={() => onSwitch(sheet.id)} onDoubleClick={() => setEditing(sheet.id)}
          onDragStart={event => { setDragging(sheet.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', sheet.id); }}
          onDragOver={event => { if (dragging !== null) event.preventDefault(); }}
          onDrop={event => { event.preventDefault(); if (dragging !== null && dragging !== sheet.id) onMove(dragging, sheets.findIndex(s => s.id === sheet.id)); setDragging(null); }}
          onDragEnd={() => setDragging(null)}
          className={cn('relative max-w-48 shrink-0 truncate border-r border-border-subtle px-4 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
            sheet.id === active.id ? 'bg-surface-row-selected font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface-row-hover',
            dragging === sheet.id && 'opacity-50')}>
          {sheet.id === active.id && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent-primary" />}
          {sheet.name}
        </button>)}
    </div>
    <div className="flex shrink-0 items-center gap-1 px-2">
      <Button type="button" variant="ghost" size="icon-sm" aria-disabled={full} title={full ? text.maxSheets : text.addSheet}
        aria-label={full ? `${text.addSheet} — ${text.maxSheets}` : text.addSheet}
        onClick={() => { if (!full) onAdd(); }}><Plus className="size-3.5" aria-hidden /></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={text.sheetActions(active.name)} title={text.sheetActions(active.name)}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top"
          // Rename opens its field only after the menu has returned focus, or the menu's focus trap would take it back.
          onCloseAutoFocus={event => { if (renameNext.current) { renameNext.current = false; event.preventDefault(); setEditing(active.id); } }}>
          <DropdownMenuItem onSelect={() => { renameNext.current = true; }}>{text.rename}</DropdownMenuItem>
          <DropdownMenuItem disabled={activeIndex <= 0} onSelect={() => onMove(active.id, activeIndex - 1)}>{text.moveLeft}</DropdownMenuItem>
          <DropdownMenuItem disabled={activeIndex >= sheets.length - 1} onSelect={() => onMove(active.id, activeIndex + 1)}>{text.moveRight}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={sheets.length < 2}>
              <span className="grid">{text.copyContext}{sheets.length < 2 && <span className="text-tiny text-text-muted">{text.copyContextNone}</span>}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {sheets.filter(sheet => sheet.id !== active.id).map(sheet => <DropdownMenuItem key={sheet.id} onSelect={() => onCopyContext(sheet.id)}>{sheet.name}</DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onDelete(active.id)}><Trash2 className="mr-2 size-3.5" aria-hidden />{text.deleteSheet}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>;
}
