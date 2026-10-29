/**
 * Synthetic server world. Values are fabricated for the prototype; they are not parser data,
 * real Site names, grants or equipment. Master values (IDs, team names) are never translated.
 */
import { KERNEL_PERMISSIONS, menuPermission, type Permission, type PublishedMetric } from '@ap/contracts';

export type Site = { id: string; label: string; rooms: string[] };
export const SITES: Site[] = [
  { id: 'MEM', label: 'MEM · 메모리', rooms: ['PHOTO', 'ETCH', 'CVD', 'DIFF'] },
  { id: 'FDRY', label: 'FDRY · 파운드리', rooms: ['PHOTO', 'ETCH', 'CMP'] },
  { id: 'XIA', label: 'XIA · Site C', rooms: ['PHOTO', 'ETCH'] },
];

export type RoleId = 'engineer' | 'admin' | 'viewer';
export type User = { role: RoleId; name: string; title: { ko: string; en: string }; permissions: Permission[]; grants: Record<string, string[]> };
/** The sample menus' permissions: the default vocabulary when the assembly passes none (the app declares the same four, ADR-0072). */
const SAMPLE_MENU_PERMISSIONS = [menuPermission('equipment:view'), menuPermission('master:view'), menuPermission('analytics:view'), menuPermission('metrics:view')];
/** Default vocabulary, kernel first: used when `createMockAdapter` gets no permission list. */
export const WORLD_PERMISSIONS: readonly Permission[] = [...KERNEL_PERMISSIONS, ...SAMPLE_MENU_PERMISSIONS];

const ENGINEER_EXCLUDED: readonly string[] = ['console:access', 'features:access'];
const VIEWER_GRANTS: readonly string[] = ['platform:view', 'metrics:view', 'notice:view', 'voc:view'];

/**
 * The three roles for one permission vocabulary: admin holds all of it, engineer all but the console and feature
 * gates, viewer only its explicit grants that the vocabulary contains. Injecting a vocabulary never widens viewer.
 */
export function createUsers(vocabulary: readonly Permission[]): Record<RoleId, User> {
  const all = [...vocabulary];
  return {
    engineer: {
      role: 'engineer', name: 'Process Engineer', title: { ko: '공정 엔지니어', en: 'Process engineer' },
      permissions: all.filter(p => !ENGINEER_EXCLUDED.includes(p)),
      grants: { MEM: ['PHOTO', 'ETCH', 'CVD'], FDRY: ['PHOTO'] },
    },
    admin: {
      role: 'admin', name: 'Platform Admin', title: { ko: '플랫폼 관리자', en: 'Platform admin' },
      permissions: all, grants: Object.fromEntries(SITES.map(s => [s.id, s.rooms])),
    },
    viewer: {
      role: 'viewer', name: 'Field Requester', title: { ko: '현업 문의자', en: 'Field requester' },
      permissions: all.filter(p => VIEWER_GRANTS.includes(p)),
      grants: { MEM: ['PHOTO'] },
    },
  };
}

/** Users of the default vocabulary; fixtures and unit tests read these. The adapter's own world is `activeWorld()`. */
export const USERS: Record<RoleId, User> = createUsers(WORLD_PERMISSIONS);

export type World = { permissions: readonly Permission[]; users: Record<RoleId, User> };
const DEFAULT_WORLD: World = { permissions: WORLD_PERMISSIONS, users: USERS };
let active: World = DEFAULT_WORLD;
/** The world of the latest `createMockAdapter` (the server state — role, usage — is one module singleton as well). */
export const activeWorld = (): World => active;
/** Builds the world of one vocabulary (default when omitted) and makes it the one the server gates read. */
export function installWorld(vocabulary?: readonly Permission[]): World {
  active = vocabulary ? { permissions: vocabulary, users: createUsers(vocabulary) } : DEFAULT_WORLD;
  return active;
}

export type Equipment = {
  equipmentId: string; site: string; room: string; line: string; prcGroup: string;
  stgroup: string; team: string; maker: string; model: string; chamberType: string;
  status: 'active' | 'idle' | 'maintenance' | 'retired';
  validFrom: string; validTo: string | null; updatedAt: string; updatedBy: string;
};

const MAKERS = [
  { maker: 'AMX', models: ['Centris-7', 'Producer-GT'], kinds: ['ETCH', 'CVD'] },
  { maker: 'LRC', models: ['Kiyo-45', 'Flex-FX'], kinds: ['ETCH'] },
  { maker: 'TEL', models: ['Tactras', 'Lithius-Pro'], kinds: ['ETCH', 'PHOTO'] },
  { maker: 'ASM', models: ['XP8', 'A412'], kinds: ['CVD', 'DIFF'] },
  { maker: 'EBR', models: ['Frex-300'], kinds: ['CMP'] },
];
const TEAMS = ['분임조 A1', '분임조 A2', '분임조 B1', '분임조 C3'];
const STATUSES: Equipment['status'][] = ['active', 'active', 'active', 'active', 'idle', 'maintenance', 'active', 'retired'];

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export const EQUIPMENT: Equipment[] = (() => {
  const rnd = seeded(7);
  const rows: Equipment[] = [];
  let n = 100;
  for (const site of SITES) for (const room of site.rooms) {
    const makers = MAKERS.filter(m => m.kinds.includes(room));
    const count = 9 + Math.floor(rnd() * 8);
    for (let i = 0; i < count; i++) {
      const m = makers[Math.floor(rnd() * makers.length)];
      const model = m.models[Math.floor(rnd() * m.models.length)];
      n += 1 + Math.floor(rnd() * 3);
      const status = STATUSES[Math.floor(rnd() * STATUSES.length)];
      const day = 1 + Math.floor(rnd() * 27);
      rows.push({
        equipmentId: `${site.id}-${room}-${String(n).padStart(4, '0')}`,
        site: site.id, room, prcGroup: `PRC-${room}-${i % 3}`, line: `L${1 + Math.floor(rnd() * 4)}`,
        stgroup: `STG-${room}-${String.fromCharCode(65 + Math.floor(rnd() * 3))}`,
        team: TEAMS[Math.floor(rnd() * TEAMS.length)],
        maker: m.maker, model, chamberType: `${room.slice(0, 2)}-${['A', 'B', 'C'][Math.floor(rnd() * 3)]}`,
        status,
        validFrom: `2025-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`,
        validTo: status === 'retired' ? `2026-0${1 + Math.floor(rnd() * 8)}-15T00:00:00` : null,
        updatedAt: `2026-09-${String(1 + Math.floor(rnd() * 25)).padStart(2, '0')}T${String(Math.floor(rnd() * 24)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00`,
        updatedBy: ['master-sync', 'kim.j', 'lee.s', 'park.h'][Math.floor(rnd() * 4)],
      });
    }
  }
  return rows;
})();

/** Server-owned exclusive upper bound for default periods (§6.3 defaultRangeTo); never browser now. */
export const DEFAULT_RANGE_TO = '2026-09-26T09:00:00';

/** Explicit exclusive end. Not a null snapshot and not equipment-master validTo. */
export const TIME_DOMAIN_OPEN_END = '9999-01-01T00:00:00';
/** Well before DEFAULT_RANGE_TO and before the prototype's 90-day links. */
export const TIME_DOMAIN_SEEDED_FROM = '2020-01-01T00:00:00';
/**
 * Inside the last 7 days before DEFAULT_RANGE_TO
 * ([2026-09-19T09:00:00, 2026-09-26T09:00:00)) and on or before the default
 * 24h start 2026-09-25T09:00:00, so a 1-day merge still covers these rows.
 */
export const TIME_DOMAIN_LATE_FROM = '2026-09-22T00:00:00';

export type TimeDomainAssertion = {
  equipmentId: string;
  timeDomainId: string;
  validFrom: string;
  validTo: string;
};

/** First two MEM PHOTO ids (sorted). Engineer and admin both resolve PHOTO. Viewer has no analytics menu. */
export const LATE_TIME_DOMAIN_EQUIPMENT_IDS: readonly string[] = EQUIPMENT
  .filter(e => e.site === 'MEM' && e.room === 'PHOTO')
  .map(e => e.equipmentId)
  .sort()
  .slice(0, 2);

function timeDomainIdFor(site: string): string {
  if (site === 'MEM' || site === 'FDRY') return 'KR-WALL';
  if (site === 'XIA') return 'CN-XIA';
  throw new Error(`no time domain for site ${site}`);
}

/** One row per equipment. Read this array on each request; do not copy it at startup. */
export const TIME_DOMAIN_ASSERTIONS: TimeDomainAssertion[] = EQUIPMENT.map(e => ({
  equipmentId: e.equipmentId,
  timeDomainId: timeDomainIdFor(e.site),
  validFrom: LATE_TIME_DOMAIN_EQUIPMENT_IDS.includes(e.equipmentId) ? TIME_DOMAIN_LATE_FROM : TIME_DOMAIN_SEEDED_FROM,
  validTo: TIME_DOMAIN_OPEN_END,
}));

export const PUBLISHED_METRICS: readonly PublishedMetric[] = [
  { metricId: 'cycle_time', publishedVersion: '4' },
  { metricId: 'occupancy_physical', publishedVersion: '3' },
  { metricId: 'non_process_dwell', publishedVersion: '2' },
  { metricId: 'job_throughput', publishedVersion: '1' },
  { metricId: 'wafer_move_count', publishedVersion: '2' },
  { metricId: 'queue_time', publishedVersion: null },
  { metricId: 'availability_scheduled', publishedVersion: '2' },
  { metricId: 'alarm_count', publishedVersion: '1' },
  { metricId: 'recipe_changeover', publishedVersion: '1' },
  { metricId: 'lot_hold_dwell', publishedVersion: '3' },
  { metricId: 'chamber_utilization', publishedVersion: '1' },
  { metricId: 'rework_rate', publishedVersion: '2' },
  { metricId: 'energy_per_wafer', publishedVersion: '1' },
  { metricId: 'setup_time', publishedVersion: null },
];
