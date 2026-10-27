import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type Ref } from 'react';
import { Check, ChevronDown, MoreHorizontal, Star } from 'lucide-react';
import type { SavedView, SavedViewListItem } from '@ap/contracts';
import { useI18n } from '@ap/kernel';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
  Input, Popover, PopoverContent, PopoverTrigger,
} from '@ap/ui';
import { approvalText, kindText, panelBadgeText, summarizeContext, visibilityShort, visibilityText, word } from './text';

/** `clean` matches the saved view; `modified` differs from it; `unsaved` has no saved view; `unapplied` has a query draft not yet applied. */
export type ViewSelectorState = 'clean' | 'modified' | 'unsaved' | 'unapplied';
export type ViewFilter = 'all' | 'mine' | 'official' | `group:${string}`;

export type ViewSelectorProps = {
  views: readonly SavedViewListItem[];
  currentId: string | null;
  /** The user's personal default for this list; a mark apart from the current check. */
  defaultId: string | null;
  state: ViewSelectorState;
  /** Switching would lose changes. Defaults to `state !== 'clean'`; pass it when the shown state hides a draft or an edit. */
  discardsChanges?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  query: string;
  onQuery: (query: string) => void;
  filter: ViewFilter;
  onFilter: (filter: ViewFilter) => void;
  /** Used by the `내 뷰` filter. */
  userId: string;
  /** Group names for audience text and the group filters; the list is the groups worth a filter. */
  groups?: readonly { id: string; name: string }[];
  ownerLabel?: (ownerId: string) => string;
  /** Panel conditions held by a view (`패널 조건 N`); the content stays opaque to this component. */
  panelCount?: (view: SavedView) => number;
  onSelect: (id: string) => void;
  /** Save to the current view. Returning `false` (or a promise of it) keeps the pending switch from happening. */
  onSave?: () => void | boolean | Promise<void | boolean>;
  /** Save the current conditions as a new view (a personal copy when the view cannot be edited). Resolve `false` when it was cancelled or failed, so a pending switch does not happen. */
  onSaveAs?: () => void | boolean | Promise<void | boolean>;
  /** Ref to the `저장` menu button, e.g. as the focus return target of the save surface. */
  saveTriggerRef?: Ref<HTMLButtonElement>;
  onRevert?: () => void;
  onMakeDefault?: (id: string | null) => void;
  onDelete?: (id: string) => void;
  onManage?: () => void;
};

type Entry = Extract<SavedViewListItem, { denied?: false }>;
const FILTER_KEYS = ['all', 'mine', 'official'] as const;

const matches = (item: SavedViewListItem, query: string, filter: ViewFilter, userId: string): boolean => {
  if (item.denied) return filter === 'all' && query.trim() === '';
  const { view } = item;
  if (query.trim() && !view.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
  if (filter === 'mine') return view.ownerId === userId;
  if (filter === 'official') return view.visibility.kind === 'official';
  if (filter.startsWith('group:')) return view.visibility.kind === 'groups' && view.visibility.groupIds.includes(filter.slice(6));
  return true;
};

export function ViewSelector(props: ViewSelectorProps) {
  const { views, currentId, defaultId, state, loading, error, query, filter, userId, groups = [] } = props;
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<{ kind: 'more'; id: string } | { kind: 'back' } | null>(null);
  /** The row (or its ⋯) that last held focus inside the popover; recovered when that view leaves the shown list. */
  const lastRow = useRef<{ id: string; index: number } | null>(null);
  const groupNames = Object.fromEntries(groups.map(g => [g.id, g.name]));

  const current = views.find((v): v is Extract<SavedViewListItem, { denied?: false }> => !v.denied && v.view.id === currentId);
  const shown = views.filter(v => matches(v, query, filter, userId));

  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (target) {
      focusAfter.current = null;
      if (target.kind === 'back') back.current?.focus();
      else list.current?.querySelector<HTMLElement>(`[data-more-for="${CSS.escape(target.id)}"]`)?.focus();
      return;
    }
    const last = lastRow.current;
    if (!last || !open || detailId !== null) return;
    if (shown.some(v => !v.denied && v.view.id === last.id)) return;
    lastRow.current = null;
    const rows = list.current?.querySelectorAll<HTMLElement>('[data-view-row]');
    if (rows?.length) rows[Math.min(last.index, rows.length - 1)].focus(); else search.current?.focus();
  });

  const trackFocus = (event: FocusEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target)) return;
    const item = target.closest<HTMLElement>('[data-view-id]');
    if (!item) { lastRow.current = null; return; }
    const id = item.dataset.viewId ?? '';
    lastRow.current = { id, index: Math.max(0, shown.findIndex(v => !v.denied && v.view.id === id)) };
  };

  const discards = props.discardsChanges ?? state !== 'clean';
  const close = () => { setOpen(false); setDetailId(null); lastRow.current = null; };
  const choose = (id: string) => {
    if (id === currentId) { close(); trigger.current?.focus(); return; }
    close();
    if (discards) setPendingId(id);
    else { props.onSelect(id); trigger.current?.focus(); }
  };
  const settlePending = async (save: boolean) => {
    const id = pendingId;
    setPendingId(null);
    if (id === null) return;
    if (save) {
      const result = await (pendingSave === 'current' ? props.onSave?.() : props.onSaveAs?.());
      if (result === false) { trigger.current?.focus(); return; }
    }
    props.onSelect(id);
    trigger.current?.focus();
  };

  const moveRow = (event: KeyboardEvent<HTMLElement>) => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-view-row]') ?? [])];
    const from = rows.indexOf(document.activeElement as HTMLElement);
    const fromSearch = document.activeElement === search.current;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || rows.length === 0) return;
    if (from < 0 && !fromSearch) return;
    event.preventDefault();
    if (event.key === 'ArrowUp' && from === 0) { search.current?.focus(); return; }
    const next = fromSearch ? 0 : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, from + (event.key === 'ArrowDown' ? 1 : -1)));
    rows[next].focus();
  };

  const triggerLabel = current ? current.view.name : state === 'unsaved' || state === 'unapplied' ? word('unsavedCondition', lang) : word('noView', lang);
  const badge = state === 'modified' ? word('modified', lang) : state === 'unsaved' ? word('unsaved', lang) : state === 'unapplied' ? word('unapplied', lang) : null;

  const canEdit = current?.capabilities.canEdit ?? false;
  const canCopy = current?.capabilities.canCopy ?? false;
  const showNew = !current || canCopy;
  const pendingSave: 'current' | 'copy' | 'new' | null = current && canEdit && props.onSave ? 'current' : (!current || canCopy) && props.onSaveAs ? (current ? 'copy' : 'new') : null;
  const newLabel = current && !canEdit && canCopy ? word('saveCopy', lang) : word('saveNew', lang);
  const detail = detailId === null ? null : views.find((v): v is Entry => !v.denied && v.view.id === detailId) ?? null;

  return (
    <div className="inline-flex items-center gap-1">
      <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setDetailId(null); }}>
        <PopoverTrigger asChild>
          <Button ref={trigger} type="button" variant="ghost" size="toolbar" aria-label={`${word('trigger', lang)}: ${triggerLabel}`}>
            <span className="max-w-48 truncate">{triggerLabel}</span>
            {badge && <Badge variant="outline">{badge}</Badge>}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]" onKeyDown={moveRow} onFocusCapture={trackFocus} onOpenAutoFocus={event => { event.preventDefault(); search.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
          {detail ? (
            <section aria-label={word('details', lang)} className="space-y-2 text-xs">
              <Button ref={back} type="button" variant="ghost" size="toolbar" onClick={() => { const id = detail.view.id; setDetailId(null); focusAfter.current = { kind: 'more', id }; }}>{word('backToList', lang)}</Button>
              <DetailRows entry={detail} lang={lang} groupNames={groupNames} ownerLabel={props.ownerLabel} panels={props.panelCount?.(detail.view) ?? 0} />
            </section>
          ) : (
            <div className="space-y-2">
              <Input ref={search} type="search" value={query} aria-label={word('search', lang)} placeholder={word('search', lang)} onChange={event => props.onQuery(event.target.value)} />
              <div role="group" aria-label={word('filterGroup', lang)} className="flex flex-wrap gap-1">
                {[...FILTER_KEYS.map(k => ({ key: k as ViewFilter, label: word(k === 'all' ? 'filterAll' : k === 'mine' ? 'filterMine' : 'filterOfficial', lang) })), ...groups.map(g => ({ key: `group:${g.id}` as ViewFilter, label: g.name }))].map(f => (
                  <Button key={f.key} type="button" size="toolbar" variant={filter === f.key ? 'secondary' : 'ghost'} aria-pressed={filter === f.key} onClick={() => props.onFilter(f.key)}>{f.label}</Button>
                ))}
              </div>
              {loading && <p role="status" className="text-xs text-text-secondary">{word('loading', lang)}</p>}
              {!loading && error && (
                <div role="alert" className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>{word('error', lang)}</span>
                  {props.onRetry && <Button type="button" size="toolbar" variant="ghost" onClick={props.onRetry}>{word('retry', lang)}</Button>}
                </div>
              )}
              {!loading && !error && shown.length === 0 && <p role="status" className="text-xs text-text-secondary">{views.length === 0 ? word('empty', lang) : word('noResult', lang)}</p>}
              {!loading && !error && shown.length > 0 && (
                <ul ref={list} aria-label={word('list', lang)} className="max-h-80 space-y-0.5 overflow-auto">
                  {shown.map(item => item.denied ? (
                    <li key={item.id} className="p-2 text-xs text-text-secondary">{word('denied', lang)} — {item.reason}</li>
                  ) : (
                    <li key={item.view.id} data-view-id={item.view.id} className="flex items-start gap-1">
                      <button data-view-row type="button" className="flex min-w-0 flex-1 items-start gap-1.5 rounded-md p-2 text-left text-xs hover:bg-surface-raised focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring" aria-current={item.view.id === currentId ? 'true' : undefined} onClick={() => choose(item.view.id)}>
                        <Check className={item.view.id === currentId ? 'h-3.5 w-3.5 shrink-0' : 'h-3.5 w-3.5 shrink-0 invisible'} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words">{item.view.name}</span>
                          <span className="flex flex-wrap items-center gap-1 text-text-secondary">
                            <span>{kindText(item.view.kind, lang)}</span>
                            <Badge variant="outline">{visibilityShort(item.view.visibility, lang, groupNames)}</Badge>
                            {item.view.approval === 'pending' && <Badge variant="secondary">{approvalText('pending', lang)}</Badge>}
                            {item.view.id === defaultId && <Badge variant="secondary"><Star className="mr-1 h-3 w-3" aria-hidden />{word('myDefault', lang)}</Badge>}
                          </span>
                        </span>
                      </button>
                      <RowMenu item={item} lang={lang} isDefault={item.view.id === defaultId} onDetails={() => { setDetailId(item.view.id); focusAfter.current = { kind: 'back' }; }} onMakeDefault={props.onMakeDefault} onDelete={props.onDelete ? () => { lastRow.current = { id: item.view.id, index: shown.indexOf(item) }; props.onDelete?.(item.view.id); } : undefined} />
                    </li>
                  ))}
                </ul>
              )}
              {props.onManage && <Button type="button" size="toolbar" variant="ghost" onClick={() => { close(); props.onManage?.(); }}>{word('manage', lang)}</Button>}
            </div>
          )}
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button ref={props.saveTriggerRef} type="button" size="toolbar" variant="ghost">{word('save', lang)}</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {current && !canEdit && current.capabilities.reason && <DropdownMenuLabel><span className="block max-w-64 whitespace-normal break-words">{current.capabilities.reason}</span></DropdownMenuLabel>}
          {current && canEdit && <DropdownMenuItem disabled={state === 'clean'} onSelect={() => { void props.onSave?.(); }}>{word('saveCurrent', lang)}</DropdownMenuItem>}
          {showNew && <DropdownMenuItem onSelect={() => props.onSaveAs?.()}>{newLabel}</DropdownMenuItem>}
          {current && state === 'modified' && <DropdownMenuItem onSelect={() => props.onRevert?.()}>{word('revert', lang)}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={pendingId !== null} onOpenChange={next => { if (!next) { setPendingId(null); trigger.current?.focus(); } }}>
        <DialogContent closeLabel={word('close', lang)} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>{word('discardTitle', lang)}</DialogTitle>
            <DialogDescription>{word('discardBody', lang)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { setPendingId(null); trigger.current?.focus(); }}>{word('cancel', lang)}</Button>
            <Button type="button" variant="secondary" onClick={() => { void settlePending(false); }}>{word('discardDrop', lang)}</Button>
            {pendingSave && <Button type="button" onClick={() => { void settlePending(true); }}>{word(pendingSave === 'current' ? 'discardSave' : pendingSave === 'copy' ? 'discardSaveCopy' : 'discardSaveNew', lang)}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowMenu({ item, lang, isDefault, onDetails, onMakeDefault, onDelete }: {
  item: Extract<SavedViewListItem, { denied?: false }>; lang: 'ko' | 'en'; isDefault: boolean;
  onDetails: () => void; onMakeDefault?: (id: string | null) => void; onDelete?: () => void;
}) {
  const canDelete = onDelete && item.capabilities.canEdit;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-more-for={item.view.id} type="button" variant="ghost" size="icon-sm" aria-label={`${item.view.name} ${word('rowActions', lang)}`}><MoreHorizontal className="h-4 w-4" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDetails}>{word('details', lang)}</DropdownMenuItem>
        {onMakeDefault && <DropdownMenuItem onSelect={() => onMakeDefault(isDefault ? null : item.view.id)}>{word(isDefault ? 'clearDefault' : 'makeDefault', lang)}</DropdownMenuItem>}
        {canDelete && <DropdownMenuItem onSelect={onDelete}>{word('remove', lang)}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DetailRows({ entry, lang, groupNames, ownerLabel, panels }: {
  entry: Extract<SavedViewListItem, { denied?: false }>; lang: 'ko' | 'en'; groupNames: Record<string, string>; ownerLabel?: (id: string) => string; panels: number;
}) {
  const { view } = entry;
  const content = summarizeContext(view.context, lang);
  const rows: [string, string][] = [
    [word('detailName', lang), view.name],
    [word('detailKind', lang), kindText(view.kind, lang)],
    [word('detailOwner', lang), ownerLabel?.(view.ownerId) ?? view.ownerId],
    [word('detailAudience', lang), visibilityText(view.visibility, lang, groupNames)],
    [word('detailApproval', lang), approvalText(view.approval, lang)],
    [word('detailContent', lang), content.length ? content.join(' · ') : word('noContent', lang)],
  ];
  return (
    <dl className="space-y-1">
      {rows.map(([term, value]) => <div key={term}><dt className="text-text-secondary">{term}</dt><dd className="break-words">{value}</dd></div>)}
      {panels > 0 && <div><dt className="sr-only">{word('panelsHeading', lang)}</dt><dd><Badge variant="outline">{panelBadgeText(panels, lang)}</Badge></dd></div>}
    </dl>
  );
}
