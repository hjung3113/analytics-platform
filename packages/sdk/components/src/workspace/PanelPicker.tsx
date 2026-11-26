import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useI18n, useMessages, usePlatformOptional } from '@ap/kernel';
import { Checkbox, PopoverContent, SearchInput, cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PanelAddItem } from './PanelAdd';
import { PanelKindIcon, PanelKindPreview } from './PanelKindPreview';
import { PANEL_ROW_SELECTOR, PanelList } from './PanelListRows';

export type PanelPickerRow = Pick<PanelAddItem, 'id' | 'category' | 'kind'> & {
  label: string; description?: string; reason?: string; status?: string; note?: string; onSelect: () => void;
};

const OTHER_COLUMN = 'other';

function rowCenter(button: HTMLButtonElement) {
  const { top, height } = button.getBoundingClientRect();
  return top + height / 2;
}

function nearestRowByCenter(source: HTMLButtonElement, neighbours: readonly HTMLButtonElement[], sourceIndex: number) {
  // On a tie, prefer the same row index (clamped to the last row), then the first tied row in DOM order.
  let nearest = neighbours[Math.min(sourceIndex, neighbours.length - 1)];
  if (!nearest) return undefined;
  const center = rowCenter(source);
  let distance = Math.abs(rowCenter(nearest) - center);
  for (const row of neighbours) {
    const nextDistance = Math.abs(rowCenter(row) - center);
    if (nextDistance < distance) { nearest = row; distance = nextDistance; }
  }
  return nearest;
}

/** Keys a section to the platform generation. As the old section retires it records whether it held focus: React removes its nodes before the content's own effects run. */
function GenerationSection({ generation, held, children }: { generation: string; held: RefObject<boolean>; children: ReactNode }) {
  return <RetiringSection key={generation} held={held}>{children}</RetiringSection>;
}

function RetiringSection({ held, children }: { held: RefObject<boolean>; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = body.current;
    return () => { if (node?.contains(node.ownerDocument.activeElement)) held.current = true; };
  }, [held]);
  return <div ref={body} className="contents">{children}</div>;
}

function CategorizedPanels({ rows }: { rows: readonly PanelPickerRow[] }) {
  const id = useId();
  const { lang, t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const [hovered, setHovered] = useState<string>();
  const match = query.trim().toLocaleLowerCase();
  const groups = new Map<string, { title: string; rows: PanelPickerRow[] }>();
  for (const row of rows) {
    const key = row.category ? `category-${row.category.id}` : OTHER_COLUMN;
    const group = groups.get(key) ?? { title: row.category?.title[lang] ?? m('panelAddOther'), rows: [] };
    if (row.label.toLocaleLowerCase().includes(match)) group.rows.push(row);
    groups.set(key, group);
  }
  const columns = [...groups].filter(([, group]) => group.rows.length > 0);
  const entry = columns.find(([key]) => key === active)?.[0] ?? columns[0]?.[0];
  const matches = columns.flatMap(([, group]) => group.rows);
  const hoveredRow = matches.find(row => row.id === hovered);
  if (hovered !== undefined && !hoveredRow) setHovered(undefined);
  // With nothing pointed at, the preview shows the first row that can be added (or the first row) instead of an empty box.
  const preview = hoveredRow ?? matches.find(row => row.id === focused) ?? matches.find(row => row.reason === undefined) ?? matches[0];

  function navigate(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(PANEL_ROW_SELECTOR)) return;
    setHovered(undefined);
    const key = event.key;
    if (key !== '/' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    if (key === '/') return search.current?.focus();
    const column = event.currentTarget;
    const adjacent = key === 'ArrowLeft' ? column.previousElementSibling : column.nextElementSibling;
    const neighbours = Array.from(adjacent?.querySelectorAll<HTMLButtonElement>(PANEL_ROW_SELECTOR) ?? []);
    const index = Array.from(column.querySelectorAll(PANEL_ROW_SELECTOR)).indexOf(event.target);
    nearestRowByCenter(event.target, neighbours, index)?.focus();
  }

  return <div className="space-y-2">
    <h2 id={id} className="font-semibold">{m('panelAddDeclared')}</h2>
    <SearchInput size="toolbar" className="w-full" inputRef={search} placeholder={m('panelAddSearch')} clearLabel={t('clear')}
      value={query} onValueChange={setQuery} onKeyDown={event => {
        if (event.key !== 'ArrowDown' || event.nativeEvent.isComposing || columns.length === 0) return;
        event.preventDefault();
        list.current?.querySelector<HTMLButtonElement>(PANEL_ROW_SELECTOR)?.focus();
      }} />
    {columns.length === 0 ? <p role="status" className="text-text-muted">{m('panelAddNoMatch')}</p> : <div className="flex gap-3">
      <div ref={list} role="group" aria-labelledby={id} className="grid min-w-0 flex-1 auto-cols-[minmax(7rem,1fr)] grid-flow-col gap-2 overflow-x-auto p-1">
        {columns.map(([key, { title, rows: columnRows }], index) => <section key={key} aria-labelledby={`${id}-${index}`}
          className="min-w-0 border-s border-border-subtle ps-2 first:border-0 first:ps-0" onKeyDownCapture={navigate}
          onFocus={event => {
            if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(PANEL_ROW_SELECTOR)) return;
            setActive(key); setFocused(event.target.dataset.panelRow); setHovered(undefined);
          }}
          onBlur={() => setFocused(undefined)}>
          <h3 id={`${id}-${index}`} className="mb-1 flex items-baseline justify-between gap-1 px-2 text-xs font-semibold">
            {title}<span className="tabular-nums text-text-muted">{columnRows.length}</span>
          </h3>
          <PanelList headingId={`${id}-${index}`} tabStop={key === entry} onHover={setHovered}
            rows={columnRows.map(row => ({ ...row, icon: <PanelKindIcon kind={row.kind} />,
              kindLabel: row.kind === undefined ? undefined : m(`panelAddKind_${row.kind}`) }))} />
        </section>)}
      </div>
      <aside className="w-44 shrink-0 space-y-2 self-start rounded-md border border-border-subtle bg-surface-sunken p-3">
        <div className="aspect-5/3 rounded-sm bg-surface-card"><PanelKindPreview kind={preview?.kind} /></div>
        {preview && <><p className="font-semibold">{preview.label}</p>
          {preview.reason && <p className="text-xs text-text-muted">{preview.reason}</p>}
          {preview.description && <p className="text-xs text-text-secondary">{preview.description}</p>}</>}
      </aside>
    </div>}
  </div>;
}

export function PanelPickerContent({ rows, categorized, label, inputLabel, pinning, close, onCloseAutoFocus, children }: {
  rows: readonly PanelPickerRow[]; categorized: boolean; label: string; inputLabel?: string;
  pinning?: { checked: boolean; onChange: (pin: boolean) => void };
  close: () => void; onCloseAutoFocus?: (event: Event) => void; children?: ReactNode;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const platform = usePlatformOptional();
  const generation = JSON.stringify([platform?.route?.menu.id, platform?.user.id, platform?.revision, platform?.scope.scopeId]);
  const content = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  // A menu, user, revision or Scope change replaces the list and the chart builder while the popover stays open. If either
  // held focus, hand it to the replacement search (or the first row) so it never falls to the page behind the dialog.
  useLayoutEffect(() => {
    const node = content.current;
    if (!held.current || !node) return;
    held.current = false;
    if (node.contains(node.ownerDocument.activeElement)) return;
    node.querySelector<HTMLElement>(categorized ? 'input[type="search"]' : PANEL_ROW_SELECTOR)?.focus();
  }, [generation, categorized]);
  const actions = rows.map(row => ({ ...row, onSelect: () => { row.onSelect(); close(); } }));
  return <PopoverContent align="end" aria-label={label} onCloseAutoFocus={onCloseAutoFocus}
    className={cn('max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto', categorized ? 'w-[60rem]' : 'w-xl')}>
    <div ref={content} className="text-sm">
      {inputLabel !== undefined && <p className="mb-3 w-fit max-w-full rounded-full bg-accent-primary-soft px-2 py-1 text-xs font-medium text-accent-primary wrap-anywhere">
        {m('panelAddInput', { selection: inputLabel })}
      </p>}
      {categorized ? <GenerationSection generation={generation} held={held}><CategorizedPanels rows={actions} /></GenerationSection>
        : <PanelList label={m('panelAddDeclared')} rows={actions} />}
      {pinning && <label className="my-2 flex min-h-6 w-fit items-center gap-2">
        <Checkbox checked={pinning.checked} onCheckedChange={checked => pinning.onChange(checked === true)} />{m('panelAddPins')}
      </label>}
      {children && <GenerationSection generation={generation} held={held}>{children}</GenerationSection>}
    </div>
  </PopoverContent>;
}
