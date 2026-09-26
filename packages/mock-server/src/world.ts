/**
 * Synthetic server world. Values are fabricated for the prototype; they are not parser data,
 * real Site names, grants or equipment. Master values (IDs, team names) are never translated.
 */
import type { Permission, PublishedMetric } from '@ap/contracts';

export type Site = { id: string; label: string; rooms: string[] };
export const SITES: Site[] = [
  { id: 'ICH', label: 'ICH · Site A', rooms: ['PH-101', 'ET-102', 'CVD-201', 'DIF-202'] },
  { id: 'CJU', label: 'CJU · Site B', rooms: ['PH-301', 'ET-302', 'CMP-303'] },
  { id: 'XIA', label: 'XIA · Site C', rooms: ['PH-501', 'ET-502'] },
];

export type RoleId = 'engineer' | 'admin' | 'viewer';
export type User = { role: RoleId; name: string; title: { ko: string; en: string }; permissions: Permission[]; grants: Record<string, string[]> };
const ALL: Permission[] = ['platform:view', 'equipment:view', 'master:view', 'analytics:view', 'metrics:view', 'notice:view', 'voc:view', 'admin:manage'];
export const USERS: Record<RoleId, User> = {
  engineer: {
    role: 'engineer', name: 'Process Engineer', title: { ko: '공정 엔지니어', en: 'Process engineer' },
    permissions: ALL.filter(p => p !== 'admin:manage'),
    grants: { ICH: ['PH-101', 'ET-102', 'CVD-201'], CJU: ['PH-301'] },
  },
  admin: {
    role: 'admin', name: 'Platform Admin', title: { ko: '플랫폼 관리자', en: 'Platform admin' },
    permissions: ALL, grants: Object.fromEntries(SITES.map(s => [s.id, s.rooms])),
  },
  viewer: {
    role: 'viewer', name: 'Field Requester', title: { ko: '현업 문의자', en: 'Field requester' },
    permissions: ['platform:view', 'metrics:view', 'notice:view', 'voc:view'],
    grants: { ICH: ['PH-101'] },
  },
};

export type Equipment = {
  equipmentId: string; name: string; site: string; room: string; line: string;
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
const ROOM_KIND: Record<string, string[]> = {
  'PH-101': ['PHOTO'], 'ET-102': ['ETCH'], 'CVD-201': ['CVD'], 'DIF-202': ['DIFF'],
  'PH-301': ['PHOTO'], 'ET-302': ['ETCH'], 'CMP-303': ['CMP'], 'PH-501': ['PHOTO'], 'ET-502': ['ETCH'],
};
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
    const kind = ROOM_KIND[room][0];
    const makers = MAKERS.filter(m => m.kinds.includes(kind));
    const count = 9 + Math.floor(rnd() * 8);
    for (let i = 0; i < count; i++) {
      const m = makers[Math.floor(rnd() * makers.length)];
      const model = m.models[Math.floor(rnd() * m.models.length)];
      n += 1 + Math.floor(rnd() * 3);
      const status = STATUSES[Math.floor(rnd() * STATUSES.length)];
      const day = 1 + Math.floor(rnd() * 27);
      rows.push({
        equipmentId: `${site.id}-${kind}-${String(n).padStart(4, '0')}`,
        name: `${kind} ${model} #${i + 1}`,
        site: site.id, room, line: `L${1 + Math.floor(rnd() * 4)}`,
        stgroup: `STG-${kind}-${String.fromCharCode(65 + Math.floor(rnd() * 3))}`,
        team: TEAMS[Math.floor(rnd() * TEAMS.length)],
        maker: m.maker, model, chamberType: `${kind.slice(0, 2)}-${['A', 'B', 'C'][Math.floor(rnd() * 3)]}`,
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

/** First two ICH PH-101 ids (sorted). Engineer and admin both resolve PH-101. Viewer has no analytics menu. */
export const LATE_TIME_DOMAIN_EQUIPMENT_IDS: readonly string[] = EQUIPMENT
  .filter(e => e.site === 'ICH' && e.room === 'PH-101')
  .map(e => e.equipmentId)
  .sort()
  .slice(0, 2);

function timeDomainIdFor(site: string): string {
  if (site === 'ICH' || site === 'CJU') return 'KR-WALL';
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
