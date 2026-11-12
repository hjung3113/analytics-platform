import { z } from 'zod';

const name = z.string().refine(value => value.trim().length > 0);
const catalogSchema = z.array(z.object({ site: name, label: name, rooms: z.array(name).min(1) }));
type CatalogSite = z.infer<typeof catalogSchema>[number];

export interface ScopeCatalog {
  readonly sites: readonly { readonly site: string; readonly label: string; readonly rooms: readonly string[] }[];
  hasSite(site: string): boolean;
  roomsOf(site: string): readonly string[];
  hasRoom(site: string, room: string): boolean;
}

/** Deployment validation is pure; diagnostics reveal names, never arbitrary label/input contents. */
export function parseScopeCatalog(input: unknown): ScopeCatalog {
  const parsed = catalogSchema.safeParse(input);
  const problems: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [entry, field, room] = issue.path;
      if (entry === undefined) problems.push('catalog: expected a list');
      else if (field === 'rooms' && issue.code === 'too_small') {
        const site = Array.isArray(input) ? input[Number(entry)]?.site : undefined;
        problems.push(typeof site === 'string' && name.safeParse(site).success ? `site ${site}: no rooms` : `entry ${entry}: no rooms`);
      } else problems.push(`entry ${entry}: invalid ${field === 'rooms' && room !== undefined ? `room ${room}` : field ?? 'entry'}`);
    }
  }
  // Check duplicates even when another entry has invalid fields: report every problem in one failure.
  const sites = new Set<string>();
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Partial<CatalogSite>;
      if (typeof row.site !== 'string' || !name.safeParse(row.site).success) continue;
      if (sites.has(row.site)) problems.push(`duplicate site ${row.site}`);
      sites.add(row.site);
      const rooms = new Set<string>();
      if (!Array.isArray(row.rooms)) continue;
      for (const room of row.rooms) {
        if (typeof room !== 'string' || !name.safeParse(room).success) continue;
        if (rooms.has(room)) problems.push(`site ${row.site}: duplicate room ${room}`);
        rooms.add(room);
      }
    }
  }
  if (!parsed.success || problems.length) throw new Error(problems.join('; '));
  const ordered = Object.freeze(parsed.data.map(entry => Object.freeze({ ...entry, rooms: Object.freeze([...entry.rooms]) })));
  const bySite = new Map(ordered.map(entry => [entry.site, entry.rooms]));
  return Object.freeze({
    sites: ordered,
    hasSite: (site: string) => bySite.has(site),
    roomsOf: (site: string) => bySite.get(site) ?? [],
    hasRoom: (site: string, room: string) => bySite.get(site)?.includes(room) ?? false,
  });
}
