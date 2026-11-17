// Product adaptation of the approved a2 editor and share dialog (#2408).
import { useId, useRef, useState } from 'react';
import { CAPABILITIES, isCapability, isSensitiveCapability, createPermissionGroupSchema, updatePermissionGroupSchema, PERMISSION_GROUP_NAME_MAX, PERMISSION_GROUP_DESCRIPTION_MAX, PERMISSION_GROUP_SHARE_MAX, PERMISSION_BATCH_MAX_ITEMS, type PermissionGroupItem, type DeclaredCapabilityItem } from '@ap/feature-shared';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, GroupedSelectionList, Input, Label, SearchInput, Textarea, copyText } from '@ap/ui';
import { usePermissionGroupWrite, createPermissionGroup, updatePermissionGroup, sharePermissionGroup } from '../../../lib/api/permission-groups';
import { useIdempotencyKey } from '../../../lib/api/useIdempotencyKey';
import { useDeclaredCapabilities } from '../../../lib/api/declared-capabilities';
import { useWorkspaceActors } from '../../../lib/cross-system/useWorkspaceActors';
import { declaredSelectionItem, groupPermissionItems, permissionSelectionItem } from '../../../lib/copy/permission-selection';
import { PERMISSION_GROUP_COPY as COPY } from '../../../lib/copy/permission-groups';
import { mapUnknownError } from '../../../lib/api/errorMapper';

export type GroupDraft = { name: string; description: string; capabilities: string[] };
export const draftOf = (group?: PermissionGroupItem | null): GroupDraft => ({ name: group?.name ?? '', description: group?.description ?? '', capabilities: [...(group?.capabilities ?? [])] });

export function GroupEditorFields({ draft, onChange, kind, declared, disabled = false }: { draft: GroupDraft; onChange: (draft: GroupDraft) => void; kind: PermissionGroupItem['kind']; declared: readonly DeclaredCapabilityItem[]; disabled?: boolean }) {
  const prefix = useId();
  const personal = kind === 'personal';
  const items = [
    ...CAPABILITIES.filter(capability => !personal || (capability !== 'workspace.admin' && !isSensitiveCapability(capability))).map(capability => ({ ...permissionSelectionItem(capability), capability })),
    ...declared.filter(item => !personal || !item.sensitive).map(item => ({ ...declaredSelectionItem(item.id, declared), capability: item.id })),
  ];
  const unavailable = draft.capabilities.filter(capability => !items.some(item => item.capability === capability));
  return <fieldset disabled={disabled} className="flex flex-col gap-4 break-keep">
    <div className="flex flex-col gap-2"><Label htmlFor={`${prefix}-name`}>{COPY.name}</Label><Input id={`${prefix}-name`} value={draft.name} maxLength={PERMISSION_GROUP_NAME_MAX} onChange={event => onChange({ ...draft, name: event.target.value })} /></div>
    <div className="flex flex-col gap-2"><Label htmlFor={`${prefix}-description`}>{COPY.description}</Label><Textarea id={`${prefix}-description`} value={draft.description} maxLength={PERMISSION_GROUP_DESCRIPTION_MAX} onChange={event => onChange({ ...draft, description: event.target.value })} /></div>
    <p className="text-xs text-text-secondary">{COPY.nonRetroactive}</p>
    {personal ? <p className="text-xs text-text-secondary">{COPY.personalNotice}</p> : null}
    <GroupedSelectionList mode="multiple" density="compact" selectionSummary="chips" aria-label={COPY.capabilities} groups={groupPermissionItems(items)} value={draft.capabilities} onChange={next => onChange({ ...draft, capabilities: next })} />
    {unavailable.map(capability => <p key={capability} className="text-xs text-text-secondary">{capability} · {COPY.unavailableCapability}<Button type="button" variant="ghost" onClick={() => onChange({ ...draft, capabilities: draft.capabilities.filter(item => item !== capability) })}>{COPY.remove}</Button></p>)}
  </fieldset>;
}

export function GroupEditorDialog({ group, kind, onClose }: { group?: PermissionGroupItem; kind: PermissionGroupItem['kind']; onClose: () => void }) {
  const [draft, setDraft] = useState(() => draftOf(group));
  const declared = useDeclaredCapabilities();
  const { key } = useIdempotencyKey(JSON.stringify({ group: group?.id, version: group?.updated_at, draft, kind }));
  const mutation = usePermissionGroupWrite(async () => {
    if (group) return updatePermissionGroup(group.id, updatePermissionGroupSchema.parse({ ...draft, expected_updated_at: group.updated_at }), key);
    return createPermissionGroup(createPermissionGroupSchema.parse({ ...draft, kind }), key);
  });
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}><DialogContent className="flex max-h-screen flex-col break-keep">
    <DialogHeader className="shrink-0"><DialogTitle>{group ? `${group.name} · ${COPY.edit}` : COPY.personalCreate}</DialogTitle><DialogDescription>{COPY.kind[kind]}</DialogDescription></DialogHeader>
    <div className="min-h-0 overflow-y-auto"><GroupEditorFields draft={draft} onChange={setDraft} kind={kind} declared={declared} disabled={mutation.isPending} /></div>
    {mutation.isError ? <p role="alert">{mapUnknownError(mutation.error).message}</p> : null}
    <DialogFooter className="shrink-0"><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>{COPY.cancel}</Button><Button disabled={mutation.isPending || !draft.name.trim() || !draft.capabilities.length || draft.capabilities.length > PERMISSION_BATCH_MAX_ITEMS} onClick={() => mutation.mutate(undefined, { onSuccess: onClose })}>{COPY.save}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function SharePermissionGroupDialog({ group, link, onClose }: { group: PermissionGroupItem; link: string; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState(group.shared_with);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const searchRef = useRef<HTMLInputElement>(null);
  const actors = useWorkspaceActors({ retry: false });
  const { key } = useIdempotencyKey(JSON.stringify({ id: group.id, people }));
  const mutation = usePermissionGroupWrite(() => sharePermissionGroup(group.id, { actor_ids: people.map(person => person.actor_id) }, key));
  const matches = (actors.actors ?? []).filter(actor => actor.actor_type !== 'system' && actor.id !== group.owner.actor_id && !people.some(person => person.actor_id === actor.id) && query.trim() && actor.display_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}><DialogContent className="break-keep" onOpenAutoFocus={event => { event.preventDefault(); searchRef.current?.focus(); }}>
    <DialogHeader><DialogTitle>«{group.name}» {COPY.share}</DialogTitle><DialogDescription>{COPY.shareNotice}</DialogDescription></DialogHeader>
    <fieldset disabled={mutation.isPending}><Label>{COPY.searchPeople}<SearchInput inputRef={searchRef} aria-label={COPY.searchPeople} value={query} onValueChange={setQuery} placeholder={COPY.search} /></Label></fieldset>
    {actors.isError ? <p role="alert">{COPY.peopleError}</p> : null}
    {query.trim() && !actors.isPending && !actors.isError && !matches.length ? <p>{COPY.noPeople}</p> : null}
    <ul>{matches.map(actor => <li key={actor.id} className="flex items-center justify-between gap-2"><span>{actor.display_name}</span><Button variant="ghost" disabled={mutation.isPending || people.length >= PERMISSION_GROUP_SHARE_MAX} aria-label={`${actor.display_name} ${COPY.add}`} onClick={() => { setPeople([...people, { actor_id: actor.id, display_name: actor.display_name }]); setQuery(''); }}>{COPY.add}</Button></li>)}</ul>
    {people.length >= PERMISSION_GROUP_SHARE_MAX ? <p>{COPY.shareLimit(PERMISSION_GROUP_SHARE_MAX)}</p> : null}
    <ul className="flex flex-wrap gap-2">{people.map(person => <li key={person.actor_id} className="rounded-pill bg-text-secondary/10 px-2 py-1 text-xs text-text-secondary">{person.display_name}<Button variant="ghost" size="icon-xs" disabled={mutation.isPending} aria-label={COPY.unshare(person.display_name)} onClick={() => setPeople(people.filter(item => item.actor_id !== person.actor_id))}>×</Button></li>)}</ul>
    <Label htmlFor="permission-group-link">{COPY.link}</Label><Input id="permission-group-link" readOnly value={link} /><Button variant="secondary" onClick={() => { void copyText(link).then(ok => setCopyState(ok ? 'copied' : 'failed')); }}>{copyState === 'copied' ? COPY.copied : COPY.copy}</Button>
    {copyState === 'failed' ? <p role="alert">{COPY.copyFailed}</p> : null}
    {mutation.isError ? <p role="alert">{mapUnknownError(mutation.error).message}</p> : null}
    <DialogFooter><Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>{COPY.cancel}</Button><Button disabled={mutation.isPending} onClick={() => mutation.mutate(undefined, { onSuccess: onClose })}>{COPY.save}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function isPersonalGroupCapability(capability: string, declared: readonly DeclaredCapabilityItem[]) {
  if (isCapability(capability)) return capability !== 'workspace.admin' && !isSensitiveCapability(capability);
  return declared.some(item => item.id === capability && !item.sensitive);
}
