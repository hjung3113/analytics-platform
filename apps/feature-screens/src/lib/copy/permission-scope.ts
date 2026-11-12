// Site·공정 (Scope) permission targets (ADR-0154 decision 6). GLOSSARY: a room is «공정» in screen copy.

export type PermissionScopeTargetKind = 'site' | 'site_room';

export const PERMISSION_SCOPE_COPY = {
  kind: '범위 종류',
  kindPlaceholder: '선택하세요',
  kindCapability: '기능',
  kindSystem: '시스템',
  kindSite: 'Site 전체 (이후 추가되는 공정 포함)',
  kindSiteRoom: 'Site·공정',
  target: '요청 대상',
  site: 'Site',
  sitePlaceholder: 'Site 선택',
  room: '공정',
  roomPlaceholder: '공정 선택',
  loading: 'Site·공정 후보를 불러오는 중입니다.',
  loadError: 'Site·공정 후보를 불러오지 못했습니다.',
  retry: '다시 시도',
  noSites: '선택할 수 있는 Site가 없습니다',
  noRooms: '선택할 수 있는 공정이 없습니다',
  kindMissing: '범위 종류를 선택하세요.',
  siteMissing: 'Site를 선택하세요.',
  roomMissing: '공정을 선택하세요.',
  notInCatalog: '카탈로그에 없음',
} as const;

/** One-line target label for rows, drawers and summaries: `Site SITE-A 전체` / `Site SITE-A · 공정 RA1`. */
export function formatPermissionScopeTarget(
  kind: PermissionScopeTargetKind,
  site: string,
  room?: string | null,
): string {
  return kind === 'site' ? `Site ${site} 전체` : `Site ${site} · 공정 ${room ?? ''}`;
}

/** The site/room target of a row carrying `<prefix>scope_kind`/`_site`/`_room`, or null for a Managed System row. */
export function scopeTargetLabelOf(
  row: {
    scope_kind?: string | undefined;
    scope_site?: string | null | undefined;
    scope_room?: string | null | undefined;
  },
): string | null {
  if ((row.scope_kind === 'site' || row.scope_kind === 'site_room') && row.scope_site) {
    return formatPermissionScopeTarget(row.scope_kind, row.scope_site, row.scope_room);
  }
  return null;
}

/** Same as `scopeTargetLabelOf` for request rows (`requested_scope_*`). */
export function requestedScopeTargetLabel(row: {
  requested_scope_kind?: string | undefined;
  requested_scope_site?: string | null | undefined;
  requested_scope_room?: string | null | undefined;
}): string | null {
  return scopeTargetLabelOf({
    scope_kind: row.requested_scope_kind,
    scope_site: row.requested_scope_site,
    scope_room: row.requested_scope_room,
  });
}
