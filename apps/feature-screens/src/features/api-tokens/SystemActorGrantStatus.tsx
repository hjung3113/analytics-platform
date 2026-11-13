import { useQuery } from '@tanstack/react-query';
import {
  CAPABILITIES,
  type ActorListItem,
  type ApiTokenItem,
  isTokenOnlyCapability,
} from '@ap/feature-shared';

import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { API_TOKEN_COPY as COPY } from '@/lib/copy/api-tokens';
import { fetchPermissionGrants } from '@/lib/api/permission-admin';
import { HostLink, useHostSeam } from '@/lib/host/host-seam';
import { permissionGrantsListKey } from '../admin/permissions/useRevokePermission.js';

/** #1806: token-only capabilities are usable only when the Actor holds the grant
 * AND a live service token carries the scope. The two states are shown
 * separately and never summarized as "usable"; nothing is auto-granted.
 * The token list state is passed in so a pending or failed token query is
 * never read as a confirmed empty scope. #2013: `tokens` is every service
 * token of the workspace (`fetchAllServiceTokens`), never the list's current
 * page or filters; a read that hit the page cap arrives as an error. */
const TOKEN_ONLY_CAPABILITIES = CAPABILITIES.filter(isTokenOnlyCapability);

export function SystemActorGrantStatus({
  actors,
  tokens,
  tokensPending,
  tokensError,
}: {
  actors: ActorListItem[];
  tokens: ApiTokenItem[];
  tokensPending: boolean;
  tokensError: boolean;
}) {
  const { canLink } = useHostSeam();
  const grants = useQuery({
    queryKey: permissionGrantsListKey,
    queryFn: ({ signal }) => fetchPermissionGrants(signal),
    enabled: TOKEN_ONLY_CAPABILITIES.length > 0 && actors.length > 0,
    retry: false,
  });
  if (TOKEN_ONLY_CAPABILITIES.length === 0 || actors.length === 0) return null;
  const now = Date.now();
  const grantHeld = (actorId: string, capability: string) =>
    (grants.data ?? []).some(
      (grant) =>
        grant.actor_id === actorId &&
        grant.capability === capability &&
        (grant.expires_at === null || Date.parse(grant.expires_at) > now),
    );
  const scopeHeld = (actorId: string, capability: string) =>
    tokens.some(
      (token) =>
        token.actorId === actorId &&
        token.scopes.includes(capability) &&
        !token.revokedAt &&
        (!token.expiresAt || Date.parse(token.expiresAt) > now),
    );
  // Pending and failed token queries are unconfirmed states, never an empty scope.
  const scopeStateLabel = (actorId: string, capability: string) => {
    if (tokensPending) return COPY.actorStatusScopeChecking;
    if (tokensError) return COPY.actorStatusScopeError;
    return scopeHeld(actorId, capability) ? COPY.actorStatusIncluded : COPY.actorStatusMissing;
  };
  return (
    <section
      className="flex flex-col gap-2 break-keep"
      data-testid="service-token-actor-status"
    >
      <p className="text-sm font-medium">{COPY.actorStatusTitle}</p>
      <p className="text-xs text-text-secondary">{COPY.actorStatusHint}</p>
      {grants.isPending ? <p className="text-xs text-text-muted">{COPY.loading}</p> : null}
      {grants.isError ? (
        <p className="text-xs text-text-danger-label">{COPY.actorStatusError}</p>
      ) : null}
      {grants.isSuccess
        ? actors.map((actor) => (
            <div
              key={actor.id}
              className="flex flex-col gap-1 text-sm"
              data-testid={`service-token-actor-status-${actor.id}`}
            >
              <p className="font-medium">{actor.display_name}</p>
              {TOKEN_ONLY_CAPABILITIES.map((capability) => (
                <p key={capability} className="text-xs text-text-secondary">
                  {getCapabilityDisplayLabel(capability)} · {COPY.actorStatusGrantLabel}:{' '}
                  {grantHeld(actor.id, capability)
                    ? COPY.actorStatusHeld
                    : COPY.actorStatusMissing}{' '}
                  · {COPY.actorStatusScopeLabel}:{' '}
                  {scopeStateLabel(actor.id, capability)}
                </p>
              ))}
            </div>
          ))
        : null}
      {canLink('/admin/permissions/grants') ? (
        <HostLink
          className="w-fit text-accent-primary underline underline-offset-2"
          to="/admin/permissions/grants"
        >
          {COPY.grantsLink}
        </HostLink>
      ) : null}
    </section>
  );
}
