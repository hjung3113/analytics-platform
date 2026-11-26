import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button, Checkbox, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { useI18n, useMessages, usePlatform, usePlatformOptional, type Text } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PageKeyRule } from '../table/tableUrlWarning';
import type { AnalysisSelection, MenuChartFields, PanelInstance } from '@ap/contracts';
import { ChartPanelPicker } from './ChartPanelPicker';
import { PanelList, PanelListRows } from './PanelListRows';
import { PanelAddDragContext } from './PanelAddDrag';

export type AnalysisPanelDraft = {
  source: `${string}/${string}`;
  inputs: Readonly<Record<string, AnalysisSelection>>;
  /** `follow` (absent) keeps reading the selection in the URL; `hold` fixes the panel to `inputs` as they are now (#2862). */
  mode?: 'follow' | 'hold';
};

export type AnalysisPanelAddition = {
  items: readonly PanelAddItem[];
  /** Adds the panel. Its return value is ignored unless `returnsOpened` is set. */
  onAdd: (draft: AnalysisPanelDraft) => void;
  /**
   * Opt-in (#2862 ②): `onAdd` returns the workspace panel id it opened (a string) when that is not the item id, such as a second instance.
   * When the «새 패널» row button is no longer there to keep focus (its chart is covered or the row lost its last choice), focus goes to
   * that tab instead of the item id's. Without it, any value `onAdd` returns is ignored.
   */
  returnsOpened?: boolean;
  /** Offers «붙잡기» beside each panel of «새 패널». The menu keeps the held inputs and wraps that panel in `HeldAnalysisSelections` (#2862). */
  hold?: boolean;
  /**
   * Shows «새 패널» in the workspace toolbar using inputs the caller already resolved. The caller checks availability and permission
   * for its draft and uses the item's `disabledReason` to display any restriction. Offer each add in one place, the toolbar or selection row.
   */
  toolbarDraft?: (item: PanelAddItem) => Omit<AnalysisPanelDraft, 'mode'> | undefined;
};
/** What the workspace hands «새 패널»: the items still offered, each with `placed` computed by the workspace (SDK internal, #2862 ②). */
export type AnalysisPanelDestinations = Omit<AnalysisPanelAddition, 'items'> & { items: readonly (PanelAddItem & { placed: boolean })[] };

export const AnalysisPanelAddContext = createContext<AnalysisPanelDestinations | null>(null);

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
export type PanelAddItem = {
  id: string; title: Text; description?: Text; disabledReason?: Text;
  /**
   * «새 패널» of `AnalysisPanelAddition` only (#2862 ②): a panel already placed is normally not offered; with `again` it still offers that one
   * mode, and the menu adds a second instance beside it (a held one beside a following one, or the reverse). A placed item with `'hold'`
   * needs the addition's `hold`: without it that item is not offered (`'follow'` still is). A panel collapsed or floating with none of
   * its slots in view is not offered. `PanelAddMenu` ignores this option.
   */
  again?: 'follow' | 'hold';
  /**
   * «새 패널» only: the workspace panel ids that show this item when they are not just `id` (its instances, a restored slot). The item is
   * placed when one of them is in view; when none is in view but one is collapsed or floating, it is not offered. Default `[id]`.
   */
  slots?: readonly string[];
};

export type PanelAddMenuProps = {
  items: readonly PanelAddItem[];
  /** Ids already in the workspace: drawn checked and disabled («이미 있음»). */
  shown?: readonly string[];
  /** Adds and pins when requested. With `panelAddDrag`, return the added workspace id if it differs. Only chart creation supplies `instance`. */
  onAdd: (id: string, pin: boolean, instance?: PanelInstance) => void;
  /** Pass the menu's `MenuMeta.chartFields` to offer charts made from settings. Permissions come from the active Platform session. */
  chartFields?: MenuChartFields;
  /** Existing instance ids outside `shown`, including hidden or collapsed panels. Reserved for new chart ids. */
  existingIds?: readonly string[];
  /** Initial state of «추가하면 고정». Default true. The choice is kept while the menu stays mounted, not stored. */
  pinByDefault?: boolean;
  className?: string;
};

/**
 * «+ 패널 추가» (#2398, #2761): declared panels and, when opted in, a chart picker with the same pin choice.
 */
export function PanelAddMenu({ items, shown = [], onAdd, chartFields, existingIds = [], pinByDefault = true, className }: PanelAddMenuProps) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { lang } = useI18n();
  const [pinOnAdd, setPinOnAdd] = useState(pinByDefault);
  const rows = items.map(item => {
    const reason = shown.includes(item.id) ? m('panelAddShown') : item.disabledReason?.[lang];
    return { id: item.id, label: item.title[lang], reason, note: reason === undefined ? item.description?.[lang] : undefined,
      onSelect: () => onAdd(item.id, pinOnAdd) };
  });
  const trigger = <Button type="button" variant="ghost" size="toolbar" className={className} data-panel-add><Plus className="size-3.5" aria-hidden />{m('panelAdd')}</Button>;
  if (chartFields) return <PanelChartPopover rows={rows} trigger={trigger} chartFields={chartFields}
    pinOnAdd={pinOnAdd} setPinOnAdd={setPinOnAdd} existingIds={[...existingIds, ...shown, ...items.map(item => item.id)]}
    onAdd={instance => onAdd(instance.id, pinOnAdd, instance)} />;
  return items.length > 0 ? <PanelAddDropdown rows={rows} trigger={trigger} pinOnAdd={pinOnAdd} setPinOnAdd={setPinOnAdd} /> : null;
}

type PickerProps = {
  trigger: React.ReactElement; rows: React.ComponentProps<typeof PanelList>['rows'];
  pinOnAdd: boolean; setPinOnAdd: (pin: boolean) => void;
};

function guardDragSelection(event: SyntheticEvent<HTMLElement>) {
  if (!event.currentTarget.hasAttribute('data-panel-add-dragging')) return;
  event.preventDefault();
  event.stopPropagation();
}

function usePanelAddSurface(rows: PickerProps['rows']) {
  const [open, setOpen] = useState(false);
  const drag = useContext(PanelAddDragContext);
  const currentRows = useRef(rows);
  useLayoutEffect(() => { currentRows.current = rows; }, [rows]);
  const addRow = (id: string) => {
    const row = currentRows.current.find(item => item.id === id);
    if (!row?.onSelect || row.reason !== undefined) return;
    const opened: unknown = row.onSelect();
    setOpen(false);
    return typeof opened === 'string' ? opened : id;
  };
  if (!drag) return { open, setOpen, rows, contentProps: undefined };
  return { open, setOpen, rows: rows.map(row => ({ ...row,
    drag: row.reason === undefined ? { id: row.id, onPointerDown: (event: React.PointerEvent<HTMLElement>) => { drag(event, row.id, addRow); } } : undefined,
  })), contentProps: {
    'data-panel-add-content': '',
    onClickCapture: guardDragSelection,
    onKeyDownCapture: (event: React.KeyboardEvent<HTMLElement>) => { if (event.key !== 'Tab') guardDragSelection(event); },
  } };
}

function PanelAddDropdown({ trigger, rows, pinOnAdd, setPinOnAdd }: PickerProps) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { open, setOpen, rows: offered, contentProps } = usePanelAddSurface(rows);
  return <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" {...contentProps}>
      <PanelListRows rows={offered} />
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem checked={pinOnAdd} onSelect={event => { event.preventDefault(); }} onCheckedChange={checked => { setPinOnAdd(checked === true); }}>
        {m('panelAddPins')}
      </DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function PanelChartPopover({ trigger, chartFields, rows, pinOnAdd, setPinOnAdd, existingIds, onAdd }: PickerProps & {
  chartFields: MenuChartFields; existingIds: readonly string[]; onAdd: (instance: PanelInstance) => void;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const platform = usePlatformOptional();
  const generation = JSON.stringify([platform?.route?.menu.id, platform?.user.id, platform?.revision, platform?.scope.scopeId]);
  const { open, setOpen, rows: offered, contentProps } = usePanelAddSurface(rows);
  return <Popover open={open} onOpenChange={setOpen}>
    {/* ArrowDown opens it as it opens the plain dropdown this replaces. */}
    <PopoverTrigger asChild onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>{trigger}</PopoverTrigger>
    <PopoverContent align="end" aria-label={m('panelAdd')} {...contentProps}
      className="max-h-[var(--radix-popover-content-available-height)] w-xl max-w-[var(--radix-popover-content-available-width)] overflow-y-auto">
      <div className="text-sm">
        <PanelList label={m('panelAddDeclared')} rows={offered.map(row => ({ ...row, onSelect: () => { row.onSelect?.(); setOpen(false); } }))} />
        <label className="my-2 flex min-h-6 w-fit items-center gap-2">
          <Checkbox checked={pinOnAdd} onCheckedChange={checked => { setPinOnAdd(checked === true); }} />{m('panelAddPins')}
        </label>
        <ChartPanelPicker key={generation} fields={chartFields} granted={permission => platform?.can(permission) === true} existingIds={existingIds}
          onAdd={instance => { onAdd(instance); setOpen(false); }} />
      </div>
    </PopoverContent>
  </Popover>;
}
