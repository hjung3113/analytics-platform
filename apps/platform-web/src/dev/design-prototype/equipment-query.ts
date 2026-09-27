/**
 * #52 prototype — equipment master data seam (throwaway). Does not import @ap/menu-equipment: the query, local
 * filters, column definitions and CSV are rebuilt here so each variant page differs only in presentation.
 */
import { usePlatform, usePlatformQuery } from '@ap/kernel';
import { serve, type Equipment } from '@ap/mock-server';

export type { Equipment };
export type Lang = 'ko' | 'en';
export type Status = Equipment['status'];

export const STATUS_TEXT: Record<Status, { ko: string; en: string }> = {
  active: { ko: '사용중', en: 'Active' }, idle: { ko: '대기', en: 'Idle' },
  maintenance: { ko: '정비', en: 'Maintenance' }, retired: { ko: '유효 종료', en: 'Retired' },
};
export const STATUSES: Status[] = ['active', 'idle', 'maintenance', 'retired'];

export type Column = { key: keyof Equipment; ko: string; en: string; align: 'left' | 'right'; kind: 'id' | 'text' | 'time' | 'status' };

/** The 14 master fields, in export order. Identifiers and master values are never translated. */
export const FIELDS: Column[] = [
  { key: 'equipmentId', ko: '설비 ID', en: 'Equipment ID', align: 'left', kind: 'id' },
  { key: 'name', ko: '설비명', en: 'Name', align: 'left', kind: 'text' },
  { key: 'room', ko: 'room_name', en: 'room_name', align: 'left', kind: 'text' },
  { key: 'line', ko: '라인', en: 'Line', align: 'left', kind: 'text' },
  { key: 'stgroup', ko: 'StGroup', en: 'StGroup', align: 'left', kind: 'text' },
  { key: 'team', ko: '분임조', en: 'Team', align: 'left', kind: 'text' },
  { key: 'maker', ko: 'Maker', en: 'Maker', align: 'left', kind: 'text' },
  { key: 'model', ko: 'Model', en: 'Model', align: 'left', kind: 'text' },
  { key: 'chamberType', ko: '챔버 유형', en: 'Chamber type', align: 'left', kind: 'text' },
  { key: 'status', ko: '상태', en: 'Status', align: 'left', kind: 'status' },
  { key: 'validFrom', ko: '유효 시작', en: 'Valid from', align: 'right', kind: 'time' },
  { key: 'validTo', ko: '유효 종료', en: 'Valid to', align: 'right', kind: 'time' },
  { key: 'updatedAt', ko: '변경 시각', en: 'Updated at', align: 'right', kind: 'time' },
  { key: 'updatedBy', ko: '변경자', en: 'Updated by', align: 'left', kind: 'text' },
];
export const field = (key: keyof Equipment) => FIELDS.find(f => f.key === key)!;
export const columns = (keys: (keyof Equipment)[]) => keys.map(field);

/** Wall-clock value as shown in tables: "2026-09-14 08:31". No timezone conversion. */
export const wall = (v: string | null) => (v ? v.replace('T', ' ').slice(0, 16) : '—');

export const PAGE_SIZE = 25;

/** Page filters (§11): page keys only, never mixed with the global Context. */
export function usePageFilters() {
  const { pageParam, setPage } = usePlatform();
  const q = pageParam('q') ?? '';
  const status = pageParam('status') ?? '';
  const maker = pageParam('maker') ?? '';
  return {
    q, status, maker, focus: pageParam('focus'),
    active: !!(q || status || maker),
    setQ: (v: string) => setPage({ q: v || null }, { replace: true }),
    setStatus: (v: string) => setPage({ status: v || null }),
    setMaker: (v: string) => setPage({ maker: v || null }),
    clear: () => setPage({ q: null, status: null, maker: null }),
    open: (id: string) => setPage({ focus: id }),
    close: () => setPage({ focus: null }),
  };
}

export function useEquipmentQuery() {
  const { global, scope } = usePlatform();
  return usePlatformQuery(signal => serve({ global, signal, mergeTimeDomain: false, compute: ({ equipment }) => equipment }), null, scope.status === 'valid');
}

export function filterRows(rows: Equipment[], q: string, status: string, maker: string) {
  const search = q.trim().toLowerCase();
  return rows.filter(e => (!search || `${e.equipmentId} ${e.name}`.toLowerCase().includes(search)) && (!status || e.status === status) && (!maker || e.maker === maker));
}

export function makers(rows: Equipment[], current: string) {
  return [...new Set([...rows.map(e => e.maker), ...(current ? [current] : [])])].sort();
}

/** Sorted by equipment ID, then sliced to 25-row pages. */
export function pageOf(rows: Equipment[], page: number) {
  const sorted = [...rows].sort((a, b) => a.equipmentId.localeCompare(b.equipmentId));
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const index = Math.min(Math.max(0, page), pages - 1);
  return { rows: sorted.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE), index, pages, total: sorted.length, start: index * PAGE_SIZE };
}

/** Filtered rows only, the 14 master fields, built locally as a blob. */
export function downloadCsv(rows: Equipment[]) {
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = '﻿' + [FIELDS.map(f => f.key).join(','), ...rows.map(e => FIELDS.map(f => escape(e[f.key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'equipment-master.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
