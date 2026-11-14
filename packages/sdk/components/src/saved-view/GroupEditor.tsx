import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { word } from './text';
import type { GroupMember, Result, ViewGroupEntry } from '@ap/contracts';
import { Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@ap/ui';
import { personLabel, toggleMember, usePeopleSearch, type PeopleSearch } from './people';

export type GroupEditorProps = {
  /** Display language; defaults to Korean for existing standalone consumers. */
  lang?: 'ko' | 'en';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit (rename, add/remove members); absent = create. */
  entry?: ViewGroupEntry;
  /** Create only: people the caller chose explicitly (e.g. a share list being saved as a group). Never a guess. */
  initialMembers?: readonly GroupMember[];
  /** The signed-in user: becomes the manager of a new group, which is not the same as being a member. */
  currentUserId: string;
  searchPeople: PeopleSearch;
  onCreate: (input: { name: string; memberIds: string[] }) => Promise<Result<ViewGroupEntry>>;
  onUpdate: (id: string, patch: { name?: string; addMembers?: string[]; removeMembers?: string[] }) => Promise<Result<ViewGroupEntry>>;
  /** The group exists on the server now. Sharing is never decided here; the host's final save does that. */
  onDone: (entry: ViewGroupEntry, kind: 'created' | 'updated') => void;
  /** Radix close-autofocus hook: the opener sends focus back to the control that opened the editor, never to a closed parent. */
  onCloseAutoFocus?: (event: Event) => void;
};

/** State resets every time `open` turns true; nothing is kept between openings. */
export function GroupEditor(props: GroupEditorProps) {
  const { open, onOpenChange } = props;
  return <Dialog open={open} onOpenChange={onOpenChange}>{open && <EditorBody {...props} />}</Dialog>;
}

function EditorBody({ lang = 'ko', onOpenChange, entry, initialMembers, currentUserId, searchPeople, onCreate, onUpdate, onDone, onCloseAutoFocus }: GroupEditorProps) {
  const editing = entry !== undefined;
  const readOnlyMembers = editing && !entry.capabilities.canEditMembers;
  const canRename = !editing || entry.capabilities.canRename;
  const [name, setName] = useState(entry?.group.name ?? '');
  const [members, setMembers] = useState<readonly GroupMember[]>(entry?.members ?? initialMembers ?? []);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = usePeopleSearch(searchPeople, query);
  // A save that finishes after this editor was closed must not touch an editor opened later.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const nameId = useId();
  const searchId = useId();
  const isManager = editing ? (entry.group.managerIds ?? []).includes(currentUserId) : true;
  const iAmMember = members.some(member => member.userId === currentUserId);
  const known = [...members, ...search.results];

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === '') { setError(word('groupNameRequired', lang)); return; }
    setBusy(true);
    setError(null);
    let result: Result<ViewGroupEntry>;
    try {
      if (editing) {
        const before = new Set(entry.members.map(member => member.userId));
        const after = new Set(members.map(member => member.userId));
        const patch: { name?: string; addMembers?: string[]; removeMembers?: string[] } = {};
        if (trimmed !== entry.group.name) patch.name = trimmed;
        const added = [...after].filter(id => !before.has(id));
        const removed = [...before].filter(id => !after.has(id));
        if (added.length > 0) patch.addMembers = added;
        if (removed.length > 0) patch.removeMembers = removed;
        result = await onUpdate(entry.group.id, patch);
      } else result = await onCreate({ name: trimmed, memberIds: members.map(member => member.userId) });
    } catch {
      // A rejected call is a failed save: keep the input and let the user try again.
      if (mounted.current) { setBusy(false); setError(word('groupUnavailable', lang)); }
      return;
    }
    if (mounted.current) setBusy(false);
    // A failed or conflicting call keeps the typed name and the chosen members.
    if (!result.ok) { if (mounted.current) setError(result.detail ?? word(({ conflict: 'groupConflict', forbidden: 'groupForbidden', unavailable: 'groupUnavailable', invalid: 'groupInvalid' } as const)[result.reason], lang)); return; }
    // The group exists even if the editor was cancelled meanwhile; only a still-open editor closes itself.
    onDone(result.value, editing ? 'updated' : 'created');
    if (mounted.current) onOpenChange(false);
  };

  return <DialogContent className="max-w-md" closeLabel={word('close', lang)} {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}>
    <DialogHeader>
      <DialogTitle>{editing ? word('editGroup', lang) : word('createGroup', lang)}</DialogTitle>
      <DialogDescription>{editing ? word('editGroupBody', lang) : word('createGroupBody', lang)}</DialogDescription>
    </DialogHeader>
    <div className="grid gap-1">
      <label htmlFor={nameId} className="text-xs font-semibold">{word('groupName', lang)}</label>
      <Input id={nameId} value={name} disabled={!canRename} onChange={event => setName(event.target.value)} />
    </div>
    <p className="text-xs text-text-secondary" data-testid="group-role">
      {isManager ? word('managerYes', lang) : word('managerNo', lang)} · {iAmMember ? word('memberYes', lang) : word('memberNo', lang)}
      {!editing && !iAmMember && word('creatorRole', lang)}
    </p>
    {editing && entry.group.kind === 'org-team' && <p className="text-xs text-text-secondary">{word('orgMembersLocked', lang)}</p>}
    <ul className="flex flex-wrap gap-1" aria-label={word('selectedMembers', lang)}>
      {members.map(member => <li key={member.userId}><Badge variant="secondary">
        <span>{personLabel(member, known)}</span>
        {!readOnlyMembers && <Button type="button" variant="ghost" size="icon-xs" aria-label={`${personLabel(member, known)} ${word('removePerson', lang)}`} onClick={() => setMembers(list => toggleMember(list, member))}><X className="h-3 w-3" aria-hidden="true" /></Button>}
      </Badge></li>)}
      {members.length === 0 && <li className="text-xs text-text-secondary">{word('membersEmpty', lang)}</li>}
    </ul>
    {!readOnlyMembers && <div className="grid gap-1">
      <label htmlFor={searchId} className="text-xs font-semibold">{word('memberSearch', lang)}</label>
      <Input id={searchId} value={query} placeholder={word('peoplePlaceholder', lang)} onChange={event => setQuery(event.target.value)} />
      <div aria-live="polite">
        {search.status === 'loading' && <p className="text-xs text-text-secondary">{word('searching', lang)}</p>}
        {search.status === 'error' && <p role="alert" className="text-xs text-text-danger-label">{word('searchFailed', lang)} <Button type="button" variant="link" size="sm" onClick={search.retry}>{word('retry', lang)}</Button></p>}
        {search.status === 'ready' && search.results.length === 0 && <p className="text-xs text-text-secondary">{word('searchEmpty', lang)}</p>}
      </div>
      <ul className="grid max-h-40 gap-1 overflow-auto" aria-label={word('searchResults', lang)}>
        {search.results.map(person => {
          const label = personLabel(person, known);
          return <li key={person.userId}><label className="flex items-center gap-2 text-sm">
            <Checkbox checked={members.some(member => member.userId === person.userId)} onCheckedChange={() => setMembers(list => toggleMember(list, person))} aria-label={label} />
            <span>{person.displayName}</span><span className="text-xs text-text-secondary">{person.affiliation}</span>
          </label></li>;
        })}
      </ul>
    </div>}
    {error && <p role="alert" className="text-xs text-text-danger-label">{error}</p>}
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{word('cancel', lang)}</Button>
      <Button type="button" disabled={busy} onClick={() => void submit()}>{editing ? word('saveChanges', lang) : word('submitGroup', lang)}</Button>
    </DialogFooter>
  </DialogContent>;
}
