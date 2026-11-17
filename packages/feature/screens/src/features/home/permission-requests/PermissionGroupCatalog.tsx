import { useEffect, useRef, useState } from 'react';
import { Button, Label, RadioGroup, RadioGroupItem } from '@ap/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type PermissionGroupItem } from '@ap/feature-shared';
import { fetchPermissionGroup, usePermissionGroups } from '../../../lib/api/permission-groups';
import { fetchPermissionCheckViaClient } from '../../../lib/api/permission-reads';
import { isApiPathId } from '../../../lib/api/path';
import { PERMISSION_GROUP_COPY as COPY, pickGroupCapabilities } from '../../../lib/copy/permission-groups';
import { getCapabilityDisplayLabel } from '../../../lib/copy/capabilities';
import { mapUnknownError } from '../../../lib/api/errorMapper';
import { GroupEditorDialog, SharePermissionGroupDialog } from '../../admin/permissions/permission-group-parts';

export function PermissionGroupCatalog({ selected, requestable, managedSystemId, linkId, groupLink, onPick, disabled, selectionVersion = 0 }: {
  selected: string | null; requestable: readonly string[]; managedSystemId?: string; linkId?: string;
  groupLink?: (id: string) => string; onPick: (group: PermissionGroupItem, capabilities: string[]) => void; disabled: boolean; selectionVersion?: number;
}) {
  const list = usePermissionGroups();
  const [dialog, setDialog] = useState<{ kind: 'create' } | { kind: 'edit' | 'share'; group: PermissionGroupItem } | null>(null);
  const [missing, setMissing] = useState<{ capability: string; reason: string }[]>([]);
  const [appliedLink, setAppliedLink] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => { generation.current += 1; }, [selectionVersion]);
  const scopeKey = `${managedSystemId ?? ''}:${requestable.join(',')}`;
  const [appliedScope, setAppliedScope] = useState(scopeKey);
  const linked = useQuery({ queryKey: ['permission-groups', 'link', linkId], queryFn: ({ signal }) => fetchPermissionGroup(linkId ?? '', signal), enabled: isApiPathId(linkId), retry: false });
  const pick = useMutation({ mutationFn: async ({ group, version }: { group: PermissionGroupItem; version: number }) => {
    const allowed = new Set(requestable);
    const checks = await Promise.all(group.capabilities.filter(capability => allowed.has(capability)).map(async capability => {
      const check = await fetchPermissionCheckViaClient(capability, managedSystemId ? { managedSystemId } : {});
      return check.decision.allow ? capability : null;
    }));
    return { group, version, ...pickGroupCapabilities(group.capabilities, allowed, new Set(checks.filter((item): item is string => item !== null))) };
  }, onSuccess: result => { if (generation.current !== result.version) return; setMissing(result.missing); onPick(result.group, result.selected); } });
  const { mutate } = pick;
  useEffect(() => {
    if (scopeKey === appliedScope) return;
    setAppliedScope(scopeKey);
    generation.current += 1;
    const group = list.data?.find(item => item.id === selected) ?? (linked.data?.id === selected ? linked.data : undefined);
    if (group) mutate({ group, version: generation.current });
  }, [scopeKey, appliedScope, list.data, selected, linked.data, mutate]);
  useEffect(() => {
    if (linked.data && !disabled && appliedLink !== linked.data.id) {
      setAppliedLink(linked.data.id);
      generation.current += 1;
      mutate({ group: linked.data, version: generation.current });
    }
  }, [linked.data, appliedLink, disabled, mutate]);
  const items = list.data ?? [];
  return <section className="flex flex-col gap-3 break-keep" aria-label={COPY.catalog}>
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{COPY.catalog}</h3><Button type="button" variant="secondary" disabled={disabled} onClick={() => setDialog({ kind: 'create' })}>{COPY.personalCreate}</Button></div>
    {list.isPending ? <p role="status">{COPY.loading}</p> : null}
    {list.isError ? <p role="status">{COPY.error}<Button type="button" variant="ghost" onClick={() => void list.refetch()}>{COPY.retry}</Button></p> : null}
    {linkId && (!isApiPathId(linkId) || linked.isError) ? <p role="status">{COPY.unavailable}</p> : null}
    <RadioGroup aria-label={COPY.catalogLabel} value={selected ?? ''} disabled={disabled || pick.isPending} onValueChange={id => { const group = items.find(item => item.id === id); if (group) { generation.current += 1; mutate({ group, version: generation.current }); } }}>
      {!list.isError ? items.map(group => <div key={group.id} className="flex items-center gap-2 border-b border-border-subtle py-2"><RadioGroupItem id={`pg-catalog-${group.id}`} value={group.id} /><Label htmlFor={`pg-catalog-${group.id}`}>{group.name} · {COPY.count(group.capabilities.length)} · {COPY.kind[group.kind]}</Label>
        {group.can_edit && group.kind === 'personal' ? <><Button type="button" variant="ghost" size="sm" aria-label={`«${group.name}» ${COPY.edit}`} onClick={() => setDialog({ kind: 'edit', group })}>{COPY.edit}</Button><Button type="button" variant="ghost" size="sm" aria-label={`«${group.name}» ${COPY.share}`} onClick={() => setDialog({ kind: 'share', group })}>{COPY.share}</Button></> : null}
      </div>) : null}
    </RadioGroup>
    {pick.isError ? <p role="alert">{mapUnknownError(pick.error).message}</p> : null}
    {selected && missing.length ? <p className="text-xs text-text-secondary">{COPY.missing}: {missing.map(item => `${getCapabilityDisplayLabel(item.capability)}(${item.reason})`).join(', ')}</p> : null}
    {dialog?.kind === 'create' ? <GroupEditorDialog kind="personal" onClose={() => setDialog(null)} /> : null}
    {dialog?.kind === 'edit' ? <GroupEditorDialog kind="personal" group={dialog.group} onClose={() => setDialog(null)} /> : null}
    {dialog?.kind === 'share' ? <SharePermissionGroupDialog group={dialog.group} link={groupLink?.(dialog.group.id) ?? ''} onClose={() => setDialog(null)} /> : null}
  </section>;
}
