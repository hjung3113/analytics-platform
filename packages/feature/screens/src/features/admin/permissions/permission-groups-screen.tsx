import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, FieldRow, ListShell, ListTabs, ObjectRow, PanelSectionTitle } from '@ap/ui';
import { PERMISSION_BATCH_MAX_ITEMS, createPermissionGroupSchema, updatePermissionGroupSchema, type PermissionGroupItem } from '@ap/feature-shared';
import { HostPrimaryAction } from '../../../lib/host/HostPrimaryAction';
import type { ClosableDetailParts } from '../../../lib/host/detail-parts';
import { useHostSeam } from '../../../lib/host/host-seam';
import { useHostSearchWriter } from '../../../lib/host/useHostSearchWriter';
import { isApiPathId } from '../../../lib/api/path';
import { fetchPermissionGroup, permissionGroupsKey, usePermissionGroups, usePermissionGroupWrite, createPermissionGroup, updatePermissionGroup, archivePermissionGroup } from '../../../lib/api/permission-groups';
import { PERMISSION_REQUESTS_PAGE_COPY as PERMISSION_REQUEST_COPY } from '../../../lib/copy/permission-requests';
import { useDeclaredCapabilities } from '../../../lib/api/declared-capabilities';
import { useIdempotencyKey } from '../../../lib/api/useIdempotencyKey';
import { mapUnknownError } from '../../../lib/api/errorMapper';
import { ApiError } from '../../../lib/api/types';
import { PERMISSION_GROUP_COPY as COPY } from '../../../lib/copy/permission-groups';
import { getCapabilityDisplayLabel } from '../../../lib/copy/capabilities';
import { formatDate } from '../../../lib/format/datetime';
import { GroupEditorFields, draftOf } from './permission-group-parts';

type Tab = 'all' | 'operator' | 'personal';
function validateSearch(input: Record<string, unknown>) {
  return { ...(input.tab === 'operator' || input.tab === 'personal' ? { tab: input.tab } : {}), ...(isApiPathId(input.selected) ? { selected: input.selected } : {}) };
}
export function isPermissionGroupsSearchValueValid(key: string, value: string) {
  return key === 'selected' ? isApiPathId(value) : key === 'tab' ? ['all', 'operator', 'personal'].includes(value) : true;
}
export function PermissionGroupsScreen({ renderDetail }: { renderDetail?: (parts: ClosableDetailParts) => ReactNode }) {
  const { hostOwnsTitle } = useHostSeam();
  const { search, write } = useHostSearchWriter('/admin/permissions/groups', validateSearch);
  const list = usePermissionGroups({ scope: 'all' });
  const [creating, setCreating] = useState(false);
  const tab = (search.tab ?? 'all') as Tab;
  const group = list.data?.find(item => item.id === search.selected);
  const close = () => { setCreating(false); write(({ selected: _selected, ...rest }) => rest); };
  const action = <Button size="toolbar" onClick={() => setCreating(true)}>{COPY.create}</Button>;
  const detail = creating ? <GroupDrawer group={null} onClose={close} {...(renderDetail ? { renderDetail } : {})} /> : search.selected ? <SelectedGroupDrawer key={search.selected} id={search.selected} {...(group ? { placeholder: group } : {})} onClose={close} {...(renderDetail ? { renderDetail } : {})} /> : undefined;
  const shell = <ListShell {...(hostOwnsTitle ? {} : { toolbar: { title: COPY.title, actions: action } })}
    tabs={<ListTabs ariaLabel={COPY.title} activeTab={tab} onTabChange={next => write(previous => ({ ...previous, tab: next }))} tabs={(['all', 'operator', 'personal'] as const).map(value => ({ value, label: COPY.tabs[value], id: `pg-tab-${value}`, controlsId: 'pg-list', ...(!list.isPending && !list.isError ? { badgeCount: list.data.filter(item => value === 'all' || item.kind === value).length } : {}) }))} />}
    list={<section id="pg-list" role="tabpanel" aria-labelledby={`pg-tab-${tab}`}>
      {list.isPending ? <p role="status">{COPY.loading}</p> : null}
      {list.isError ? <div role="alert">{COPY.error}<Button onClick={() => void list.refetch()}>{COPY.retry}</Button></div> : null}
      {!list.isPending && !list.isError && !list.data.length ? <p>{COPY.empty}</p> : null}
      {!list.isError ? list.data?.filter(item => tab === 'all' || item.kind === tab).map(item => <ObjectRow key={item.id} id={COPY.title} title={item.name} selected={item.id === search.selected} onClick={() => { setCreating(false); write(previous => ({ ...previous, selected: item.id })); }} meta={<span>{COPY.count(item.capabilities.length)} · {item.owner.display_name} · {item.kind === 'operator' ? COPY.grantCount(item.grant_count) : COPY.shareCount(item.shared_with.length)} · {formatDate(item.updated_at)}</span>} />) : null}
    </section>} {...(renderDetail ? {} : { detailPanel: detail })} />;
  return <>{hostOwnsTitle ? <HostPrimaryAction>{action}</HostPrimaryAction> : null}{shell}{renderDetail ? detail : null}</>;
}

function SelectedGroupDrawer({ id, placeholder, onClose, renderDetail }: { id: string; placeholder?: PermissionGroupItem; onClose: () => void; renderDetail?: (parts: ClosableDetailParts) => ReactNode }) {
  const [stale, setStale] = useState(false);
  const detail = useQuery({ queryKey: [...permissionGroupsKey, 'detail', id], queryFn: ({ signal }) => fetchPermissionGroup(id, signal), retry: false, staleTime: 0, ...(placeholder ? { placeholderData: placeholder } : {}) });
  if (!detail.isFetchedAfterMount || detail.isFetching || detail.isError || !detail.data) {
    const body = <div>{stale ? <p role="alert">{PERMISSION_REQUEST_COPY.staleWrite}</p> : null}<p role={detail.isError ? 'alert' : 'status'}>{detail.isError ? COPY.error : COPY.loading}</p>{detail.isError ? <Button onClick={() => void detail.refetch()}>{COPY.retry}</Button> : null}</div>;
    return renderDetail ? renderDetail({ title: COPY.title, body, requestClose: onClose }) : body;
  }
  return <GroupDrawer key={detail.data.updated_at} group={detail.data} onClose={onClose} stale={stale} onStale={() => { setStale(true); void detail.refetch(); }} {...(renderDetail ? { renderDetail } : {})} />;
}

function GroupDrawer({ group, onClose, renderDetail, stale, onStale }: { group: PermissionGroupItem | null; onClose: () => void; renderDetail?: (parts: ClosableDetailParts) => ReactNode; stale?: boolean; onStale?: () => void }) {
  const [editing, setEditing] = useState(group === null);
  const [draft, setDraft] = useState(() => draftOf(group));
  const declared = useDeclaredCapabilities();
  const { key } = useIdempotencyKey(JSON.stringify({ id: group?.id, version: group?.updated_at, draft }));
  const mutation = usePermissionGroupWrite(async (action: 'save' | 'archive') => {
    if (group && action === 'archive') return archivePermissionGroup(group.id, { expected_updated_at: group.updated_at }, key);
    if (group) return updatePermissionGroup(group.id, updatePermissionGroupSchema.parse({ ...draft, expected_updated_at: group.updated_at }), key);
    return createPermissionGroup(createPermissionGroupSchema.parse({ ...draft, kind: 'operator' }), key);
  });
  const body = <div className="flex flex-col gap-5 break-keep">
    {stale ? <p role="alert">{PERMISSION_REQUEST_COPY.staleWrite}</p> : null}
    {editing ? <GroupEditorFields kind={group?.kind ?? 'operator'} draft={draft} onChange={setDraft} declared={declared} disabled={mutation.isPending} /> : group ? <>
      <PanelSectionTitle>{COPY.title}</PanelSectionTitle><FieldRow label={COPY.description} inset="none">{group.description ?? '—'}</FieldRow>
      <FieldRow label={COPY.creator} inset="none">{group.owner.display_name}</FieldRow>
      {group.kind === 'personal' ? <FieldRow label={COPY.sharedWith} inset="none">{group.shared_with.map(actor => actor.display_name).join(', ') || COPY.none}</FieldRow> : <FieldRow label={COPY.grants} inset="none">{COPY.grantValue(group.grant_count)}</FieldRow>}
      <FieldRow label={COPY.updated} inset="none">{formatDate(group.updated_at)}</FieldRow>
      <PanelSectionTitle>{COPY.count(group.capabilities.length)}</PanelSectionTitle><ul>{group.capabilities.map(capability => <li key={capability}>{getCapabilityDisplayLabel(capability, declared)} <span className="font-mono text-xs text-text-muted">{capability}</span></li>)}</ul><p className="text-xs text-text-secondary">{COPY.nonRetroactive}</p>
    </> : null}
    {mutation.isError ? <p role="alert">{mapUnknownError(mutation.error).message}</p> : null}
  </div>;
  const footer = <div className="flex justify-end gap-2">
    <Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>{COPY.cancel}</Button>
    {editing ? <Button disabled={mutation.isPending || !draft.name.trim() || !draft.capabilities.length || draft.capabilities.length > PERMISSION_BATCH_MAX_ITEMS} onClick={() => mutation.mutate('save', { onSuccess: onClose, onError: error => { if (error instanceof ApiError && error.code === 'conflict.stale_write') onStale?.(); } })}>{COPY.save}</Button> : group?.can_edit ? <><Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate('archive', { onSuccess: onClose, onError: error => { if (error instanceof ApiError && error.code === 'conflict.stale_write') onStale?.(); } })}>{COPY.archive}</Button><Button onClick={() => setEditing(true)}>{COPY.edit}</Button></> : null}
  </div>;
  const parts = { title: group?.name ?? COPY.create, body, footer, requestClose: () => { if (!mutation.isPending) onClose(); } };
  return renderDetail ? renderDetail(parts) : <aside className="flex flex-col gap-5 p-6"><PanelSectionTitle>{parts.title}</PanelSectionTitle>{body}{footer}</aside>;
}
