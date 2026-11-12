import { type ReactNode, type RefObject, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { type ApiTokenItem, visibleApiTokenScopeBundles } from '@ap/feature-shared';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Callout, Checkbox, EmptyState,
  StatusBadge, UserChip,
} from '@ap/ui';
import { fetchApiTokens, fetchSystemActors, revokeApiToken } from '@/lib/api/api-tokens';
import { resolveActors } from '@/lib/api/actors';
import { useHostSearchWriter } from '@/lib/host/useHostSearchWriter';
import type { HostSearch } from '@/lib/host/search';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { API_TOKEN_COPY as COPY } from '@/lib/copy/api-tokens';
import { formatDate, formatDateTime } from '@/lib/format/datetime';
import { HostPrimaryAction } from '@/lib/host/HostPrimaryAction';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { TokenIssueDrawer } from './TokenIssueDrawer';
import { getCapabilityDisplayLabel } from '@/lib/copy/capabilities';
import { SystemActorGrantStatus } from './SystemActorGrantStatus';

export type ApiTokenDrawerParts = ClosableDetailParts & { returnFocusRef: RefObject<HTMLElement | null> };
export interface ApiTokenTableParts {
  rows: ApiTokenItem[];
  columns: { id: string; header: string; cell: (row: ApiTokenItem) => ReactNode; sortable: false }[];
  rowAction: (row: ApiTokenItem) => ReactNode;
  summary: ReactNode;
  pagination: ReactNode;
  preferenceKey: string;
}
export interface ApiTokensScreenProps {
  service?: boolean;
  canManageService?: boolean;
  renderTable: (parts: ApiTokenTableParts) => ReactNode;
  renderDrawer: (parts: ApiTokenDrawerParts) => ReactNode;
}
const validateFilters = (raw: HostSearch) => ({ noExpiry: raw.noExpiry === 'true' ? 'true' : undefined, kind: raw.kind === 'all' ? 'all' : undefined });

export const API_TOKENS_QUERY_KEY = ['api-tokens'] as const;

/** Complete bundles keep their aliases; remaining individual scopes use the feature labels. */
export function scopeLabel(scopes: readonly string[]): string {
  const matches = visibleApiTokenScopeBundles(undefined, { service: true }).filter(bundle => bundle.capabilities.every(cap => scopes.includes(cap)));
  const covered = new Set<string>(matches.flatMap(bundle => [...bundle.capabilities]));
  return [...matches.map(bundle => bundle.label), ...scopes.filter(scope => !covered.has(scope)).map(scope => scope === 'validation.worker' ? '검증 작업자' : getCapabilityDisplayLabel(scope))].join(' · ') || '—';
}

export function ApiTokensScreen({ service = false, canManageService = false, renderTable, renderDrawer }: ApiTokensScreenProps) {
  const enabled = !service || canManageService;
  const client = useQueryClient();
  const { search, write } = useHostSearchWriter(service ? '/operations/service-tokens' : '/tokens', validateFilters);
  const noExpiry = service && search.noExpiry === 'true';
  const kind = service && search.kind !== 'all' ? 'service' : undefined;
  const filterKey = `${noExpiry}:${kind ?? 'all'}`;
  const [pageState, setPage] = useState<{ cursors: (string | undefined)[]; index: number; filterKey: string }>({ cursors: [undefined], index: 0, filterKey });
  const page = pageState.filterKey === filterKey ? pageState : { cursors: [undefined], index: 0, filterKey };
  if (pageState.filterKey !== filterKey) setPage(page);
  const issueTrigger = useRef<HTMLButtonElement>(null);
  const [issuing, setIssuing] = useState(false);
  const [revoke, setRevoke] = useState<ApiTokenItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const revokeLock = useRef(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const tokens = useQuery({
    queryKey: [...API_TOKENS_QUERY_KEY, service, noExpiry, kind, page.cursors[page.index]],
    queryFn: ({ signal }) => fetchApiTokens(service, page.cursors[page.index], noExpiry, signal, kind), enabled,
  });
  const actors = useQuery({ queryKey: ['api-token-system-actors'], queryFn: ({ signal }) => fetchSystemActors(signal), enabled: service && enabled });
  const rows = tokens.data?.items ?? [];
  const actorIds = [...new Set(rows.map(row => row.actorId))].sort();
  const owners = useQuery({ queryKey: ['api-token-owners', actorIds], queryFn: ({ signal }) => resolveActors({ actorIds }, signal), enabled: service && enabled && actorIds.length > 0 });
  const refresh = () => client.invalidateQueries({ queryKey: API_TOKENS_QUERY_KEY });
  if (!enabled) return <Callout tone="amber" title={COPY.serviceTitle}><p className="break-keep">{COPY.adminOnly}</p></Callout>;
  const columns: ApiTokenTableParts['columns'] = [
    { id: 'name', header: '이름 · 접두사', sortable: false, cell: row => <div className="space-y-1"><p className="font-medium">{row.name}</p><p className="text-xs text-text-secondary"><span className="font-mono">ap_{row.prefix}_…</span>{service ? <span> · {row.kind === 'service' ? '서비스' : '개인'}</span> : null}</p></div> },
    ...(service ? [{ id: 'actor', header: '귀속 Actor', sortable: false as const, cell: (row: ApiTokenItem) => {
      const actor = owners.data?.actors.find(a => a.id === row.actorId);
      return actor ? <UserChip user={{ display_name: actor.display_name }} size="sm" /> : <span className="text-text-muted">—</span>;
    } }] : []),
    { id: 'scopes', header: '권한', sortable: false, cell: row => scopeLabel(row.scopes) },
    { id: 'expiresAt', header: COPY.expiry, sortable: false, cell: row => row.expiresAt ? formatDate(row.expiresAt) : <StatusBadge tone="neutral">{COPY.never}</StatusBadge> },
    { id: 'lastUsedAt', header: '마지막 사용 · 주소', sortable: false, cell: row => <div className="space-y-1"><p>{row.lastUsedAt ? `${formatDateTime(row.lastUsedAt)} KST` : COPY.noUse}</p>{row.lastUsedIp ? <p className="font-mono text-xs text-text-secondary">{row.lastUsedIp}</p> : <p className="text-xs text-text-secondary">{COPY.noAddress}</p>}</div> },
    { id: 'status', header: '상태', sortable: false, cell: row => row.revokedAt ? <StatusBadge tone="neutral">{COPY.revoked}</StatusBadge>
      : row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now() ? <StatusBadge tone="neutral">{COPY.expired}</StatusBadge>
      : <StatusBadge tone={row.unusedWarning ? 'warning' : 'success'}>{row.unusedWarning ? COPY.unused : service ? COPY.tokenValid : COPY.available}</StatusBadge> },
  ];
  const primary = <Button ref={issueTrigger} variant="primary" size="sm" disabled={issuing || revoking} onClick={() => setIssuing(true)}><Plus className="size-4" />{COPY.issue}</Button>;
  const pagination = <div className="flex justify-end gap-2">
    <Button variant="secondary" size="toolbar" disabled={page.index === 0 || tokens.isFetching} onClick={() => setPage(previous => ({ ...previous, index: previous.index - 1 }))}>{COPY.previous}</Button>
    <Button variant="secondary" size="toolbar" disabled={!tokens.data?.nextCursor || tokens.isFetching} onClick={() => {
      const cursor = tokens.data?.nextCursor;
      if (cursor) setPage(previous => ({ ...previous, cursors: [...previous.cursors.slice(0, previous.index + 1), cursor], index: previous.index + 1 }));
    }}>{COPY.next}</Button>
  </div>;
  async function confirmRevoke() {
    if (!revoke || revokeLock.current) return;
    revokeLock.current = true; setRevoking(true); setRevokeError(null);
    try { await revokeApiToken(service, revoke.id); setRevoke(null); await refresh(); }
    catch (error) { setRevokeError(mapUnknownError(error).message); }
    finally { revokeLock.current = false; setRevoking(false); }
  }
  return <div className="flex w-full flex-col gap-4 break-keep" data-testid={service ? 'service-tokens' : 'api-tokens'}>
    <HostPrimaryAction>{primary}</HostPrimaryAction>
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-text-secondary">{service ? COPY.serviceList : COPY.personalIntersection}</p>
      {service ? <div className="flex shrink-0 items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={noExpiry} onCheckedChange={value => write(previous => ({ ...previous, noExpiry: value === true ? 'true' : undefined }))} />{COPY.noExpiry}</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={kind === undefined} onCheckedChange={value => write(previous => ({ ...previous, kind: value === true ? 'all' : undefined }))} />{COPY.includePersonal}</label>
      </div> : null}
    </div>
    {tokens.isPending ? <p role="status">{COPY.loading}</p> : tokens.isError ? <Callout tone="red" title={mapUnknownError(tokens.error).message} action={<Button variant="secondary" size="sm" onClick={() => void tokens.refetch()}>{COPY.retry}</Button>}>{null}</Callout>
      : rows.length === 0 ? <><EmptyState icon={<KeyRound className="size-4" />} title={noExpiry || page.index > 0 ? COPY.noResults : COPY.empty} body={COPY.emptyHint} action={<Button variant="primary" size="sm" disabled={issuing || revoking} onClick={() => setIssuing(true)}>{COPY.firstIssue}</Button>} />{page.index > 0 ? pagination : null}</>
      : renderTable({ rows, columns, preferenceKey: service ? 'service-tokens' : 'api-tokens',
        summary: `현재 페이지 ${rows.length}건 · ${page.index + 1}페이지`, pagination,
        rowAction: row => row.revokedAt ? <span className="text-xs text-text-muted">폐기 완료</span> : <Button variant="secondary" size="toolbar" aria-label={`${row.name} 폐기`} disabled={issuing || revoking} onClick={() => { setRevokeError(null); setRevoke(row); }}>폐기</Button>,
      })}
    {service ? (
      <SystemActorGrantStatus
        actors={actors.data ?? []}
        tokens={rows}
        tokensPending={tokens.isPending}
        tokensError={tokens.isError}
      />
    ) : null}
    {issuing ? <TokenIssueDrawer returnFocusRef={issueTrigger} service={service} actors={actors} renderDrawer={renderDrawer} onClose={() => setIssuing(false)} onIssued={refresh} /> : null}
    <AlertDialog open={revoke !== null} onOpenChange={open => { if (!open && !revoking) setRevoke(null); }}>
      <AlertDialogContent className="break-keep"><AlertDialogHeader><AlertDialogTitle>{COPY.revokeTitle}</AlertDialogTitle><AlertDialogDescription>{COPY.revokeHint}</AlertDialogDescription></AlertDialogHeader>
        <p className="text-sm font-medium">{revoke?.name}</p><p className="font-mono text-xs">ap_{revoke?.prefix}_…</p>
        <p className="text-xs text-text-secondary">{revoke?.lastUsedAt ? `${formatDateTime(revoke.lastUsedAt)} KST` : COPY.noUse} · {revoke?.lastUsedIp ?? COPY.noAddress}</p>
        {revokeError ? <p role="alert" className="text-sm text-text-danger-label">{revokeError}</p> : null}
        <AlertDialogFooter><AlertDialogCancel disabled={revoking}>{COPY.cancel}</AlertDialogCancel><Button variant="destructive" disabled={revoking} onClick={() => void confirmRevoke()}>{COPY.revoke}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
