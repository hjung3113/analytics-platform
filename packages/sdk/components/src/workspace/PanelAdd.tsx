import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, cn } from '@ap/ui';
import { useI18n, useMessages, usePlatform, type Text } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PageKeyRule } from '../table/tableUrlWarning';
import type { AnalysisSelection } from '@ap/contracts';

export type AnalysisPanelDraft = {
  source: `${string}/${string}`;
  inputs: Readonly<Record<string, AnalysisSelection>>;
};

export type AnalysisPanelAddition = {
  items: readonly PanelAddItem[];
  onAdd: (draft: AnalysisPanelDraft) => void;
};

export const AnalysisPanelAddContext = createContext<AnalysisPanelAddition | null>(null);

/**
 * Panels a menu keeps across its drill steps (#2398, #2391), in one repeated page key (`pageKey`, kernel identifier rule, declared in the
 * menu's `pageKeys` and `repeatedPageKeys`, usually also `hiddenPageKeys`). Share links and saved views carry the key like any declared page
 * key. `known` is the menu's own list of pinnable panel ids: an unknown id in the address is ignored when read and never rewritten here
 * (the menu rejects it with `usePageKeyRules(rules)`). The order is the order of pinning; nothing is pinned by default (the key's absence).
 */
export function usePinnedPanels(pageKey: string, known: readonly string[]): {
  pinned: readonly string[];
  isPinned: (id: string) => boolean;
  pin: (id: string) => void;
  unpin: (id: string) => void;
  toggle: (id: string) => void;
  rules: PageKeyRule[];
} {
  const { pageParams, setPage } = usePlatform();
  const raw = pageParams(pageKey);
  const knownKey = JSON.stringify(known);
  const rawKey = JSON.stringify(raw);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `rawKey`/`knownKey` are the value identities of `raw`/`known`
  const pinned = useMemo(() => [...new Set(raw.filter(id => known.includes(id)))], [rawKey, knownKey]);
  // Several changes in one event (two pins in one callback) build on each other: each starts from the set the last change of this address
  // wrote, not from the render's `pinned`. A new address (the write landed, Back/Forward, a link) starts again from what it holds.
  const pending = useRef<readonly string[] | null>(null);
  useEffect(() => { pending.current = null; }, [rawKey, pageKey]);
  const change = useCallback((edit: (list: readonly string[]) => readonly string[] | undefined) => {
    const next = edit(pending.current ?? pinned);
    if (next === undefined) return;
    pending.current = next;
    setPage({ [pageKey]: next.length > 0 ? [...next] : null });
  }, [pinned, pageKey, setPage]);
  const pin = useCallback((id: string) => { change(list => (known.includes(id) && !list.includes(id) ? [...list, id] : undefined)); }, [known, change]);
  const unpin = useCallback((id: string) => { change(list => (list.includes(id) ? list.filter(other => other !== id) : undefined)); }, [change]);
  const toggle = useCallback((id: string) => { change(list => (list.includes(id) ? list.filter(other => other !== id) : known.includes(id) ? [...list, id] : undefined)); }, [known, change]);
  const isPinned = useCallback((id: string) => pinned.includes(id), [pinned]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `knownKey` is the value identity of `known`
  const rules = useMemo(() => [{ key: pageKey, label: COMPONENTS_MESSAGES.panelPinnedKey, valid: (value: string) => known.includes(value), repeated: true }], [pageKey, knownKey]);
  return { pinned, isPinned, pin, unpin, toggle, rules };
}

/**
 * One panel the menu offers in «패널 추가». `disabledReason` disables the item and says why (for example «이 단계에서는 쓸 수 없음»). A disabled item
 * stays a focusable `aria-disabled` item, so arrow keys reach it and its reason is read; choosing it does nothing and keeps the menu open.
 */
export type PanelAddItem = { id: string; title: Text; description?: Text; disabledReason?: Text };

export type PanelAddMenuProps = {
  items: readonly PanelAddItem[];
  /** Ids already in the workspace: drawn checked and disabled («이미 있음»). */
  shown?: readonly string[];
  /** The menu adds the panel to its `panels` (with `placement: 'below'` to open it as a new row) and pins it when `pin` is true. */
  onAdd: (id: string, pin: boolean) => void;
  /** Initial state of «추가하면 고정». Default true. The choice is kept while the menu stays mounted, not stored. */
  pinByDefault?: boolean;
  className?: string;
};

/**
 * «+ 패널 추가» (#2398, layout §12.8): a list of the panels the menu offers plus one «추가하면 고정» check. The SDK draws the list and reports the
 * pick; the menu decides what a panel is, where it may be added and adds it. No row context menu: adding is this list only (#2391 decision).
 */
export function PanelAddMenu({ items, shown = [], onAdd, pinByDefault = true, className }: PanelAddMenuProps) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { lang } = useI18n();
  const [pinOnAdd, setPinOnAdd] = useState(pinByDefault);
  if (items.length === 0) return null;
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="toolbar" className={cn(className)} data-panel-add><Plus className="size-3.5" aria-hidden />{m('panelAdd')}</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {items.map(item => {
        const already = shown.includes(item.id);
        const reason = already ? m('panelAddShown') : item.disabledReason?.[lang];
        const disabled = reason !== undefined;
        return <DropdownMenuItem key={item.id} aria-disabled={disabled || undefined} onSelect={event => {
          if (disabled) { event.preventDefault(); return; }
          onAdd(item.id, pinOnAdd);
        }}>
          <span className="flex min-w-0 flex-col">
            <span className={disabled ? 'text-text-muted' : undefined}>{item.title[lang]}</span>
            {(reason ?? item.description?.[lang]) && <span className="text-xs text-text-muted">{reason ?? item.description?.[lang]}</span>}
          </span>
        </DropdownMenuItem>;
      })}
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem checked={pinOnAdd} onSelect={event => { event.preventDefault(); }} onCheckedChange={checked => { setPinOnAdd(checked === true); }}>
        {m('panelAddPins')}
      </DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
