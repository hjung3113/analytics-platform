import { buildQuery, type EquipmentAxisDescriptor, ContractError, emptyGlobal, formatMetricVersion, formatPeriod, parseQuery, sameGlobal, serializeGlobal, type GlobalContext } from '@ap/contracts';
import { labelledCondition, type MenuEntry, type Registry, type ReturnContextKey } from '@ap/kernel';
import { withPaneContext, type PaneScreen } from '@ap/kernel/host';
import { canMountPaneScreen } from './boardMenus';
import { screens, type PaneEdit, type Sheet } from './boardModel';

type CanOpen = (menuId: string) => boolean;

/** The analysis-Context keys in the order a pane header and its popover list them (Scope counts as a key, docs/16 §4). */
const KEY_ORDER: readonly ReturnContextKey[] = ['scope', 'time', 'roomNames', 'line', 'prcGroup', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric'];

/** `value` is what the header shows, null for a key the pane does not set; `raw` is the key's canonical value, which comparison uses (display drops seconds and a Condition's axis). */
export type ContextEntry = { key: ReturnContextKey; value: string | null; raw: string | null };
export type ContextRow = ContextEntry & { differs: boolean };

const KEY_FIELDS: Record<ReturnContextKey, readonly (keyof GlobalContext)[]> = {
  scope: ['scopeId'], time: ['from', 'to'], roomNames: ['roomNames'], line: ['lineNames'], prcGroup: ['prcGroups', 'membershipBasis'], condition: ['condition', 'membershipBasis'], selection: ['selection'], lot: ['lotIds'],
  ppid: ['ppid'], recipe: ['recipeIds'], metric: ['metricId', 'metricVersion'],
};

/** The key's value in the address contract's own serialization (06 §6); null when the Context does not set it. */
function rawValue(global: GlobalContext, key: ReturnContextKey): string | null {
  const part = Object.fromEntries(KEY_FIELDS[key].map(field => [field, global[field]])) as Partial<GlobalContext>;
  const pairs = serializeGlobal({ ...emptyGlobal, ...part });
  return pairs.length === 0 ? null : JSON.stringify(pairs);
}

/** The keys a Context sets: the value the header shows and the canonical one two panes are compared by. `none` names an explicitly empty set in the display. */
export function contextValues(global: GlobalContext, none: string, axes: readonly EquipmentAxisDescriptor[] = [], lang: 'ko' | 'en' = 'ko', asOf = ''): ContextEntry[] {
  const set = (ids: readonly string[] | null) => (ids === null ? null : ids.length === 0 ? none : ids.join(', '));
  const values: Record<ReturnContextKey, string | null> = {
    scope: global.scopeId,
    time: global.from !== null && global.to !== null ? formatPeriod(global.from, global.to, lang) : null,
    roomNames: set(global.roomNames),
    line: set(global.lineNames),
    prcGroup: global.prcGroups === null ? null : set(global.prcGroups) + (global.membershipBasis === 'asOf' ? ` · ${asOf}` : ''),
    condition: global.condition ? labelledCondition(global.condition, axes, lang) + (global.membershipBasis === 'asOf' ? ` · ${asOf}` : '') : null,
    selection: set(global.selection),
    lot: set(global.lotIds),
    ppid: global.ppid,
    recipe: set(global.recipeIds),
    metric: global.metricId === null ? null : global.metricVersion === null ? global.metricId : `${global.metricId} ${formatMetricVersion(global.metricVersion)}`,
  };
  return KEY_ORDER.map(key => ({ key, value: values[key], raw: rawValue(global, key) }));
}

const menuOf = (registry: Registry, screen: PaneScreen): MenuEntry | null => registry.menus.find(m => m.id === screen.menuId) ?? null;

/** Parse an address's Context; only a ContractError means the address is unreadable. */
function globalOfUrl(registry: Registry, menuId: string, url: string): GlobalContext | null {
  try {
    const menu = registry.menus.find(m => m.id === menuId);
    return parseQuery(url, menu?.pageKeys ?? [], { repeated: menu?.repeatedPageKeys }).global;
  } catch (error) {
    if (error instanceof ContractError) return null;
    throw error;
  }
}

/** A pane's analysis Context, or null when its menu is unknown or its saved address does not parse for that menu. */
export function paneGlobal(registry: Registry, screen: PaneScreen): GlobalContext | null {
  return menuOf(registry, screen) === null ? null : globalOfUrl(registry, screen.menuId, screen.query);
}

/** Only the Context of the latest main screen becomes a new pane's starting condition (docs/16 §5). */
export function defaultQuery(registry: Registry, recent: readonly { menuId: string; url: string }[]): string {
  const latest = recent[0];
  const at = latest?.url.indexOf('?') ?? -1;
  if (!latest || at === -1) return '';
  const global = globalOfUrl(registry, latest.menuId, latest.url.slice(at));
  return global === null ? '' : buildQuery(global);
}

/** The panes that take part in comparison and in Context actions: content the user's role would actually mount, with a readable address. */
function participants(registry: Registry, canOpen: CanOpen, panes: readonly (PaneScreen | null)[]): (GlobalContext | null)[] {
  return panes.map(screen => (screen !== null && canMountPaneScreen(registry, canOpen, screen) ? paneGlobal(registry, screen) : null));
}

/** What a pane header shows about its Context against the other panes of the sheet. `compared` is false while it is the only content pane. */
export type PaneSignal = { rows: ContextRow[]; differing: ContextRow[]; same: ContextRow[]; compared: boolean };

export function paneSignals(registry: Registry, canOpen: CanOpen, panes: readonly (PaneScreen | null)[], none: string, axes: readonly EquipmentAxisDescriptor[] = [], lang: 'ko' | 'en' = 'ko', asOf = ''): (PaneSignal | null)[] {
  const globals = participants(registry, canOpen, panes);
  const values = globals.map(g => (g === null ? null : contextValues(g, none, axes, lang, asOf)));
  return values.map((own, index) => {
    if (own === null) return null;
    const others = values.filter((v, i): v is ContextEntry[] => i !== index && v !== null);
    const rows = own.map((entry, k) => ({ ...entry, differs: others.some(other => other[k].raw !== entry.raw) }))
      .filter(row => row.value !== null || row.differs);
    return { rows, differing: rows.filter(r => r.differs), same: rows.filter(r => !r.differs), compared: others.length > 0 };
  });
}

/** `1, 3` for a list, `1–3` for a run of consecutive numbers (1-based). */
export function paneNumbers(indices: readonly number[]): string {
  const numbers = [...indices].sort((a, b) => a - b).map(i => i + 1);
  const parts: string[] = [];
  for (let i = 0; i < numbers.length;) {
    let end = i;
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end++;
    parts.push(end > i ? `${numbers[i]}–${numbers[end]}` : `${numbers[i]}`);
    i = end + 1;
  }
  return parts.join(', ');
}

/** The target's address with `global` as its Context: its page keys stay except the menu's reset keys (the kernel's own rule). Null if it does not parse. */
function withContext(menu: MenuEntry, query: string, global: GlobalContext): string | null {
  try { return withPaneContext(menu, query, global); } catch (error) {
    if (error instanceof ContractError) return null;
    throw error;
  }
}

/** `이 조건을 시트의 모든 칸에 적용`: `others` counts the other content panes it could reach; `edits` those whose Context actually changes. Null if the source cannot be read. */
export function applyContextToSheet(registry: Registry, canOpen: CanOpen, sheet: Sheet, sourceIndex: number): { edits: PaneEdit[]; others: number } | null {
  const panes = screens(sheet);
  const globals = participants(registry, canOpen, panes);
  const source = globals[sourceIndex];
  if (!source) return null;
  const edits: PaneEdit[] = [];
  let others = 0;
  panes.forEach((pane, index) => {
    const global = globals[index];
    if (index === sourceIndex || pane === null || global === null) return;
    others++;
    if (sameGlobal(global, source)) return;
    const query = withContext(menuOf(registry, pane)!, pane.query, source);
    if (query !== null) edits.push({ index, paneId: sheet.panes[index].id, before: pane, after: { ...pane, query } });
  });
  return { edits, others };
}

/** `이 시트 조건을 다른 시트에 복사`: pane i of `from` onto pane i of `to`, only where both hold content the role can mount. */
export function copyContextToSheet(registry: Registry, canOpen: CanOpen, from: Sheet, to: Sheet): PaneEdit[] {
  const source = participants(registry, canOpen, screens(from));
  const target = participants(registry, canOpen, screens(to));
  const edits: PaneEdit[] = [];
  screens(to).forEach((pane, index) => {
    const global = source[index];
    if (index >= from.panes.length || pane === null || global == null || target[index] === null || sameGlobal(target[index]!, global)) return;
    const query = withContext(menuOf(registry, pane)!, pane.query, global);
    if (query !== null) edits.push({ index, paneId: to.panes[index].id, before: pane, after: { ...pane, query } });
  });
  return edits;
}

/**
 * The screen a pane gets when `menu` replaces what it held. It starts with the old pane's Context and nothing else, but only when the
 * role can mount the old screen; a denied or unavailable pane's saved Context is never read, and the new screen starts from `freshQuery`.
 */
export function replacementScreen(registry: Registry, canOpen: CanOpen, old: PaneScreen, menu: MenuEntry, freshQuery: string): PaneScreen {
  const global = canMountPaneScreen(registry, canOpen, old) ? paneGlobal(registry, old) : null;
  return { menuId: menu.id, params: {}, query: global === null ? freshQuery : withContext(menu, '', global) ?? freshQuery };
}

export const firstEmptyPane = (sheet: Sheet): number => sheet.panes.findIndex(p => p.screen === null);
