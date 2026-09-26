import type { Equipment } from '@ap/mock-server';
import { type AuditEvent, type GlobalContext, parseDateTime, shift } from '@ap/contracts';
import { serve } from '@ap/mock-server';

export const statusText = {
  active: { ko: '사용중', en: 'Active' }, idle: { ko: '대기', en: 'Idle' },
  maintenance: { ko: '정비', en: 'Maintenance' }, retired: { ko: '유효 종료', en: 'Retired' },
};
export const statusTone = { active: 'success', idle: 'neutral', maintenance: 'warning', retired: 'neutral' } as const;
export const fields: { key: keyof Equipment; ko: string; en: string }[] = [
  { key: 'equipmentId', ko: '설비 ID', en: 'Equipment ID' }, { key: 'name', ko: '설비명', en: 'Name' },
  { key: 'room', ko: 'room_name', en: 'room_name' }, { key: 'line', ko: '라인', en: 'Line' },
  { key: 'stgroup', ko: 'StGroup', en: 'StGroup' }, { key: 'team', ko: '분임조', en: 'Team' },
  { key: 'maker', ko: 'Maker', en: 'Maker' }, { key: 'model', ko: 'Model', en: 'Model' },
  { key: 'chamberType', ko: '챔버 유형', en: 'Chamber type' }, { key: 'status', ko: '상태', en: 'Status' },
  { key: 'validFrom', ko: '유효 시작', en: 'Valid from' }, { key: 'validTo', ko: '유효 종료', en: 'Valid to' },
  { key: 'updatedAt', ko: '변경 시각', en: 'Updated at' }, { key: 'updatedBy', ko: '변경자', en: 'Updated by' },
];
export function filterEquipment(rows: Equipment[], q: string, status: string, maker: string) {
  const search = q.trim().toLowerCase();
  return rows.filter(e => (!search || `${e.equipmentId} ${e.name}`.toLowerCase().includes(search)) && (!status || e.status === status) && (!maker || e.maker === maker));
}
// Destination identity is a request constraint, never a mutation of inherited URL Context.
export function equipmentRequest(global: GlobalContext, id: string, signal: AbortSignal) {
  return serve({ global: { ...global, roomNames: null, condition: null, selection: [id] }, signal, mergeTimeDomain: false,
    compute: ({ equipment }) => equipment.find(e => e.equipmentId === id) ?? null, isEmpty: e => e === null });
}
export function validity(e: Equipment) {
  const durationHours = e.validTo ? (parseDateTime(e.validTo, 'validTo').getTime() - parseDateTime(e.validFrom, 'validFrom').getTime()) / 3_600_000 : 24 * 60;
  const changedAt = shift(e.validFrom, Math.min(24 * 30, Math.floor(durationHours / 2)));
  return [
    { from: e.validFrom, to: changedAt, chamberType: `${e.chamberType}-V1` },
    { from: changedAt, to: e.validTo, chamberType: e.chamberType },
  ];
}
export function audit(e: Equipment): AuditEvent[] {
  const segments = validity(e);
  return [
    { id: `${e.equipmentId}-create`, at: e.validFrom, actor: 'master-sync', action: 'create', source: 'system', changes: { equipmentId: [null, e.equipmentId], chamberType: [null, segments[0].chamberType] } },
    { id: `${e.equipmentId}-version`, at: segments[1].from, actor: 'master-sync', action: 'update', source: 'system', changes: { chamberType: [segments[0].chamberType, e.chamberType] } },
    ...(e.validTo ? [{ id: `${e.equipmentId}-retire`, at: e.validTo, actor: e.updatedBy, action: 'retire' as const, source: 'user' as const, changes: { validTo: [null, e.validTo] as [null, string] } }] : []),
    { id: `${e.equipmentId}-sync`, at: e.updatedAt, actor: e.updatedBy, action: 'sync', source: 'system' },
  ];
}
export function downloadCsv(rows: Equipment[]) {
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = '\uFEFF' + [fields.map(f => f.key).join(','), ...rows.map(e => fields.map(f => escape(e[f.key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'equipment-master.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
