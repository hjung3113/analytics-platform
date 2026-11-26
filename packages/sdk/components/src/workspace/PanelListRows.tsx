import { useId, useRef, useState, type PointerEventHandler } from 'react';
import { Button, DropdownMenuItem, cn } from '@ap/ui';

const TYPEAHEAD_MS = 500;

type Row = { label: string; reason?: string; note?: string; onSelect?: () => void; drag?: { id: string; onPointerDown: PointerEventHandler<HTMLElement> } };

function PanelListRow({ label, reason, note, onSelect, drag, presentation = 'menu', tabIndex, onFocus }: Row & {
  presentation?: 'menu' | 'named-menu' | 'popover'; tabIndex?: number; onFocus?: () => void;
}) {
  const id = useId();
  const description = [reason, note].filter(Boolean).join(' · ');
  const named = presentation !== 'menu';
  const attrs = { 'aria-label': named ? label : undefined, 'aria-disabled': reason !== undefined || undefined,
    'aria-describedby': named && description ? id : undefined, 'data-panel-add-source': drag?.id, onPointerDown: drag?.onPointerDown };
  const dragClass = drag ? 'cursor-grab touch-none select-none' : undefined;
  const content = <span className="flex min-w-0 flex-col break-keep">
    <span className={reason !== undefined && presentation !== 'named-menu' ? 'text-text-muted' : undefined}>{label}</span>
    {description && <span id={id} className="text-xs text-text-muted">{description}</span>}
  </span>;
  if (presentation === 'popover') return <Button type="button" variant="ghost" size="toolbar" tabIndex={tabIndex} onFocus={onFocus} {...attrs}
    className={cn('h-auto min-h-7 w-full justify-start text-start whitespace-normal', dragClass)}
    onClick={() => { if (reason === undefined) onSelect?.(); }}>{content}</Button>;
  return <DropdownMenuItem {...attrs} className={dragClass} onSelect={event => {
    if (reason !== undefined) event.preventDefault();
    else onSelect?.();
  }}>{content}</DropdownMenuItem>;
}

export function PanelListRows({ rows, presentation = 'menu' }: {
  rows: readonly (Row & { id: string })[]; presentation?: 'menu' | 'named-menu';
}) {
  return <>{rows.map(({ id, ...row }) => <PanelListRow key={id} {...row} presentation={presentation} />)}</>;
}

/** A list of actions with one Tab stop inside a larger popover. The roving group holds no selection. */
export function PanelList({ rows, label }: { rows: readonly (Row & { id: string })[]; label: string }) {
  const labelId = useId();
  const [focused, setFocused] = useState<string>();
  const entry = rows.some(row => row.id === focused) ? focused : rows[0]?.id;
  // Typeahead as in a menu: characters typed within a short pause form a prefix, searched from the row after the focused one.
  const typed = useRef({ text: '', at: 0 });
  return <>
    <div id={labelId} className="mb-2 font-semibold">{label}</div>
    {rows.length > 0 && <div role="toolbar" aria-orientation="vertical" aria-labelledby={labelId}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) typed.current = { text: '', at: 0 }; }} onKeyDown={event => {
      const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
      const index = buttons.findIndex(button => button === event.target);
      if (index < 0) return;
      if (event.key.length === 1 && event.key !== ' ' && !event.altKey && !event.ctrlKey && !event.metaKey) {
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
      {rows.map(({ id, ...row }) => <PanelListRow key={id} {...row} presentation="popover" tabIndex={id === entry ? 0 : -1} onFocus={() => { setFocused(id); }} />)}
    </div>}
  </>;
}
