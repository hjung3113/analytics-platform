// Site and 공정 pickers for a site/room permission target (ADR-0154 decision 6), shared by the request dialog, the
// requester's 권한 요청 page and the direct-grant form. Choices come only from the candidate read (decision 5).
// `request` mode offers only what the caller does not hold yet; `grant` mode offers the whole catalog.

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@ap/ui';
import * as React from 'react';

import {
  type PermissionScopeCatalogCandidate,
  usePermissionScopeCandidates,
} from '@/lib/api/permission-scope-candidates';
import { PERMISSION_SCOPE_COPY as COPY, type PermissionScopeTargetKind } from '@/lib/copy/permission-scope';

export interface PermissionScopeTargetDraft {
  kind: PermissionScopeTargetKind;
  site: string;
  room: string;
}

export function scopeSitesFor(
  sites: readonly PermissionScopeCatalogCandidate[],
  kind: PermissionScopeTargetKind,
  mode: 'request' | 'grant',
): PermissionScopeCatalogCandidate[] {
  if (mode === 'grant') return [...sites];
  return sites.filter((site) =>
    kind === 'site' ? !site.siteGranted : site.rooms.some((room) => !room.granted),
  );
}

export function scopeRoomsFor(
  sites: readonly PermissionScopeCatalogCandidate[],
  site: string,
  mode: 'request' | 'grant',
): string[] {
  const entry = sites.find((candidate) => candidate.site === site);
  return (entry?.rooms ?? [])
    .filter((room) => mode === 'grant' || !room.granted)
    .map((room) => room.room);
}

/** The first missing pick of a draft, or null when it is complete. */
export function scopeTargetMissing(draft: PermissionScopeTargetDraft): 'site' | 'room' | null {
  if (draft.site === '') return 'site';
  if (draft.kind === 'site_room' && draft.room === '') return 'room';
  return null;
}

export function PermissionScopeTargetFields({
  idPrefix,
  draft,
  onChange,
  mode,
  showSite = true,
  disabled = false,
  siteError = null,
  roomError = null,
  siteRef,
  roomRef,
}: {
  idPrefix: string;
  draft: PermissionScopeTargetDraft;
  onChange: (next: PermissionScopeTargetDraft) => void;
  mode: 'request' | 'grant';
  /** False when the site is fixed by the caller (a blocked place's Site target). */
  showSite?: boolean;
  disabled?: boolean;
  siteError?: string | null;
  roomError?: string | null;
  siteRef?: React.Ref<HTMLButtonElement>;
  roomRef?: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
  const candidates = usePermissionScopeCandidates(true);

  if (candidates.isPending) {
    return (
      <output className="flex flex-col gap-2" aria-label={COPY.loading}>
        <Skeleton className="h-10 w-full" />
      </output>
    );
  }
  if (candidates.isError) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-danger">
        <p>{COPY.loadError}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => void candidates.refetch()}>
          {COPY.retry}
        </Button>
      </div>
    );
  }

  const sites = scopeSitesFor(candidates.data, draft.kind, mode);
  const rooms = draft.site === '' ? [] : scopeRoomsFor(candidates.data, draft.site, mode);
  const siteId = `${idPrefix}-site`;
  const roomId = `${idPrefix}-room`;

  return (
    <>
      {showSite && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={siteId}>{COPY.site}</Label>
          {sites.length === 0 && <p className="text-sm text-text-muted">{COPY.noSites}</p>}
          <Select
            value={draft.site}
            onValueChange={(site) => onChange({ ...draft, site, room: '' })}
            disabled={disabled}
          >
            <SelectTrigger
              ref={siteRef}
              id={siteId}
              aria-label={COPY.site}
              aria-invalid={siteError !== null}
              aria-describedby={siteError !== null ? `${siteId}-error` : undefined}
            >
              <SelectValue placeholder={COPY.sitePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sites.map((site) => (
                  <SelectItem key={site.site} value={site.site}>
                    {site.label && site.label !== site.site ? `${site.site} · ${site.label}` : site.site}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {siteError !== null && (
            <p id={`${siteId}-error`} role="alert" className="text-xs text-text-danger">
              {siteError}
            </p>
          )}
        </div>
      )}
      {draft.kind === 'site_room' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={roomId}>{COPY.room}</Label>
          {draft.site !== '' && rooms.length === 0 && (
            <p className="text-sm text-text-muted">{COPY.noRooms}</p>
          )}
          <Select
            value={draft.room}
            onValueChange={(room) => onChange({ ...draft, room })}
            disabled={disabled || draft.site === ''}
          >
            <SelectTrigger
              ref={roomRef}
              id={roomId}
              aria-label={COPY.room}
              aria-invalid={roomError !== null}
              aria-describedby={roomError !== null ? `${roomId}-error` : undefined}
            >
              <SelectValue placeholder={COPY.roomPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {rooms.map((room) => (
                  <SelectItem key={room} value={room}>
                    {room}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {roomError !== null && (
            <p id={`${roomId}-error`} role="alert" className="text-xs text-text-danger">
              {roomError}
            </p>
          )}
        </div>
      )}
    </>
  );
}
