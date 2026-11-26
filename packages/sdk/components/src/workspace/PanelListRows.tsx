import { useId, useRef, useState, type PointerEventHandler, type ReactNode } from 'react';
import { Button, DropdownMenuItem, cn } from '@ap/ui';

const TYPEAHEAD_MS = 500;
export const PANEL_ROW_SELECTOR = 'button[data-panel-row]';

export type PanelListRowDrag = { id: string; onPointerDown: PointerEventHandler<HTMLElement> };
type Row = { id: string; label: string; reason?: string; status?: string; note?: string; description?: string; kindLabel?: string; icon?: ReactNode;
  onSelect?: () => void; drag?: PanelListRowDrag };

function PanelListRow({ id: rowId, label, reason, status, note, onSelect, drag, presentation = 'menu', tabIndex, onFocus, onHover, icon, description: detail, kindLabel }: Row & {
  presentation?: 'menu' | 'named-menu' | 'popover'; tabIndex?: number; onFocus?: () => void; onHover?: (id: string | undefined) => void;
}) {
  const id = useId();
  const description = [reason, note].filter(Boolean).join(' · ');
  // A short status replaces the full reason on screen; the full reason stays in the row's accessible description.
  const visible = status ?? description;
  const extra = [status === undefined || status === description ? '' : description, kindLabel, detail].filter(Boolean).join(' · ');
  const named = presentation !== 'menu';
  const attrs = { 'aria-label': named ? label : undefined, 'aria-disabled': reason !== undefined || undefined,
    'aria-describedby': named && (visible || extra) ? id : undefined, 'data-panel-row': rowId,
    'data-panel-add-source': drag?.id, onPointerDown: drag?.onPointerDown };
  const dragClass = drag ? 'cursor-grab touch-none select-none' : undefined;
  const content = <span className="flex min-w-0 flex-col break-keep">
    <span className={reason !== undefined && presentation !== 'named-menu' ? 'text-text-muted' : undefined}>{label}</span>
    {(visible || extra) && <span id={id} className="text-xs text-text-muted">{visible}
      {extra && <span className="sr-only">{visible ? ' · ' : ' '}{extra}</span>}
    </span>}
  </span>;
  if (presentation === 'popover') return <Button type="button" variant="ghost" size="toolbar" tabIndex={tabIndex} onFocus={onFocus} {...attrs}
    className={cn('h-auto min-h-7 w-full justify-start text-start whitespace-normal', dragClass)}
    onPointerEnter={onHover && (event => { onHover(event.currentTarget.dataset.panelRow); })}
    onPointerMove={onHover && (event => { onHover(event.currentTarget.dataset.panelRow); })}
    onPointerLeave={onHover && (() => { onHover(undefined); })}
    onClick={() => { if (reason === undefined) onSelect?.(); }}>
    {icon ? <span className="flex min-w-0 items-start gap-1.5"><span className="mt-0.5 shrink-0">{icon}</span>{content}</span> : content}
  </Button>;
  return <DropdownMenuItem {...attrs} className={dragClass} onSelect={event => {
    if (reason !== undefined) event.preventDefault();
    else onSelect?.();
  }}>{content}</DropdownMenuItem>;
}

export function PanelListRows({ rows, presentation = 'menu' }: {
  rows: readonly Row[]; presentation?: 'menu' | 'named-menu';
}) {
  return <>{rows.map(row => <PanelListRow key={row.id} {...row} presentation={presentation} />)}</>;
}

/** A list of actions with one Tab stop inside a larger popover. The roving group holds no selection. */
export function PanelList({ rows, label, headingId, tabStop = true, onHover }: {
  rows: readonly Row[]; label?: string; headingId?: string; tabStop?: boolean; onHover?: (id: string | undefined) => void;
}) {
  const labelId = useId();
  const [focused, setFocused] = useState<string>();
  const entry = rows.some(row => row.id === focused) ? focused : rows[0]?.id;
  // Typeahead as in a menu: characters typed within a short pause form a prefix, searched from the row after the focused one.
  const typed = useRef({ text: '', at: 0 });
  return <>
    {!headingId && <div id={labelId} className="mb-2 font-semibold">{label}</div>}
    {rows.length > 0 && <div role="toolbar" aria-orientation="vertical" className="flex flex-col gap-1" aria-labelledby={headingId ?? labelId}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) typed.current = { text: '', at: 0 }; }} onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(PANEL_ROW_SELECTOR));
      const index = buttons.findIndex(button => button === event.target);
      if (index < 0) return;
      if (event.key.length === 1 && event.key !== ' ') {
        const now = event.timeStamp;
        const text = (now - typed.current.at < TYPEAHEAD_MS ? typed.current.text : '') + event.key.toLocaleLowerCase();
        typed.current = { text, at: now };
        // As in the menu it replaces: one key repeated means that key, cycling through its rows from the next one.
        const prefix = Array.from(text).every(char => char === text[0]) ? text[0]! : text;
        const from = prefix.length === 1 ? index + 1 : index;
        const order = [...buttons.slice(from), ...buttons.slice(0, from)];
        const match = order.find(button => (button.getAttribute('aria-label') ?? '').toLocaleLowerCase().startsWith(prefix));
        if (match) { event.preventDefault(); match.focus(); }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      buttons[next]?.focus();
    }}>
      {rows.map(row => <PanelListRow key={row.id} {...row} presentation="popover" onHover={onHover}
        tabIndex={tabStop && row.id === entry ? 0 : -1} onFocus={() => { setFocused(row.id); }} />)}
    </div>}
  </>;
}
