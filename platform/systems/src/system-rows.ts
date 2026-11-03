import type { ManagedSystemRow, SpaceLinks } from '@ap/feature-bridge';

/**
 * The rows of the 운영 콘솔 「시스템」 screen (#1289 node j, ADR-0110 decision 5), derived from the server's space links and Managed System list.
 * Pure: the page passes the Registry's spaces (label lookup) and the data; nothing here reads a permission (the link grants none, ADR-0068 decision 1).
 */
export type SystemRowKind = 'platform' | 'space' | 'manual';
export type SystemRow = {
  key: string;
  kind: SystemRowKind;
  /** The business system (space) this system was registered for; null for 「플랫폼」 and manually registered systems. */
  spaceId: string | null;
  /** The Registry's label of the space; null when the space is not in the Registry (the row then names the space by its id). */
  spaceLabel: { ko: string; en: string } | null;
  /** The tracked system's name; null when the link points at a system the list does not hold. */
  systemName: string | null;
  archived: boolean;
  /** `connected` / `disconnected` for a space row (`declared`); none for the other kinds. */
  link: 'connected' | 'disconnected' | null;
};

type SpaceLabels = readonly { id: string; label: { ko: string; en: string } }[];

export function systemRows(data: SpaceLinks & { systems: readonly ManagedSystemRow[] }, spaces: SpaceLabels): SystemRow[] {
  const byId = new Map(data.systems.map((system) => [system.id, system]));
  const spaceIndex = new Map(spaces.map((space, index) => [space.id, index]));
  const rows: SystemRow[] = [];

  if (data.platformManagedSystemId !== null) {
    const platform = byId.get(data.platformManagedSystemId);
    rows.push({ key: 'platform', kind: 'platform', spaceId: null, spaceLabel: null, systemName: platform?.name ?? null, archived: platform?.archived ?? false, link: null });
  }

  const linked = [...data.links].sort((a, b) => (spaceIndex.get(a.spaceId) ?? Number.MAX_SAFE_INTEGER) - (spaceIndex.get(b.spaceId) ?? Number.MAX_SAFE_INTEGER) || a.spaceId.localeCompare(b.spaceId));
  for (const link of linked) {
    const system = byId.get(link.managedSystemId);
    const space = spaces.find((item) => item.id === link.spaceId);
    rows.push({ key: `space:${link.spaceId}`, kind: 'space', spaceId: link.spaceId, spaceLabel: space?.label ?? null, systemName: system?.name ?? null, archived: system?.archived ?? false, link: link.declared ? 'connected' : 'disconnected' });
  }

  // Registered by hand in 업무 흐름 설정: every live system that is neither a linked system nor 「플랫폼」.
  const taken = new Set([...data.links.map((link) => link.managedSystemId), ...(data.platformManagedSystemId === null ? [] : [data.platformManagedSystemId])]);
  const manual = data.systems.filter((system) => !taken.has(system.id) && !system.archived).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const system of manual) rows.push({ key: `manual:${system.id}`, kind: 'manual', spaceId: null, spaceLabel: null, systemName: system.name, archived: false, link: null });
  return rows;
}
