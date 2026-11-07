import { emptyGlobal, type GlobalContext, type Pair } from '@ap/contracts';
import type { MenuEntry, MenuPlatform } from '@ap/kernel';
import type { Origin, Target } from './endpoints';

/** Like VOC, freeze declared page pairs separately from global Context; returnTo is navigation state. */
export function snapshotOrigin(menu: Pick<MenuEntry, 'id' | 'pageKeys'>, global: GlobalContext, pairs: readonly Pair[]): Origin {
  const page: Record<string, string | string[]> = {};
  for (const key of menu.pageKeys) {
    if (key === 'returnTo') continue;
    const values = pairs.filter(([name]) => name === key).map(([, value]) => value);
    if (values.length) page[key] = values.length === 1 ? values[0]! : values;
  }
  return { menuId: menu.id, context: structuredClone({ ...global, page }) };
}
export function originLinkOptions(origin: Origin): NonNullable<Parameters<MenuPlatform['resolveLink']>[1]> {
  const global = { ...emptyGlobal };
  for (const key of Object.keys(emptyGlobal) as (keyof GlobalContext)[]) {
    if (Object.hasOwn(origin.context, key)) Object.assign(global, { [key]: origin.context[key] });
  }
  const page: Record<string, string | string[]> = {};
  const saved = origin.context.page;
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [key, value] of Object.entries(saved)) {
      if (key === 'returnTo') continue;
      if (typeof value === 'string' || (Array.isArray(value) && value.every(v => typeof v === 'string'))) page[key] = value;
    }
  }
  return { global, page };
}
/**
 * A subject the origin menu names (`MenuMeta.subjectPageKeys`, #1429) suggests a target only; it never replaces the saved Selection (§22).
 * The feature knows no menu's key names: without a declared equipment/process value it falls back to the Selection.
 */
export function suggestedTargets(origin: Origin | null, subjectKeys?: Readonly<Partial<Record<Target['kind'], string>>>): Target[] {
  if (!origin) return [];
  const page = originLinkOptions(origin).page;
  const declared = (kind: Target['kind']): string | null => {
    const key = subjectKeys?.[kind];
    const value = key ? page?.[key] : undefined;
    return typeof value === 'string' && value.trim() ? value : null;
  };
  const equipment = declared('equipment'), process = declared('process');
  if (equipment || process) return [equipment ? { kind: 'equipment', externalKey: equipment, displayName: equipment } : { kind: 'process', externalKey: process!, displayName: process! }];
  const ids = Array.isArray(origin.context.selection) ? origin.context.selection.filter((id): id is string => typeof id === 'string' && !!id.trim()) : [];
  return [...new Set(ids)].map(id => ({ kind: 'equipment', externalKey: id, displayName: id }));
}

/** The API limits the UTF-8 JSON encoding of context, not its character count. */
export function originContextTooLarge(origin: Origin | null): boolean {
  return !!origin && new TextEncoder().encode(JSON.stringify(origin.context)).byteLength > 8192;
}
/** Separate source page input; malformed input is rejected rather than silently lost. */
export function parseOriginPage(value: string): Pair[] | null {
  try {
    const saved: unknown = JSON.parse(value);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
    const pairs: Pair[] = [];
    for (const [key, entry] of Object.entries(saved)) {
      if (typeof entry === 'string') pairs.push([key, entry]);
      else if (Array.isArray(entry) && entry.every(v => typeof v === 'string')) pairs.push(...entry.map((v): Pair => [key, v]));
      else return null;
    }
    return pairs;
  } catch { return null; }
}
/** The subject page keys the origin menu declared, or none when the menu is gone from the Registry. */
export function originSubjectKeys(registry: { menuById: (id: string) => { subjectPageKeys?: Readonly<Partial<Record<Target['kind'], string>>> } }, origin: Origin | null) {
  if (!origin) return undefined;
  try { return registry.menuById(origin.menuId).subjectPageKeys; } catch { return undefined; }
}
