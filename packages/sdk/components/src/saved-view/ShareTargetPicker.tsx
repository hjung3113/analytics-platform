import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { word, memberCountText, shareSummaryText, groupCreatedText } from './text';
import type { GroupMember, Result, ViewGroupEntry } from '@ap/contracts';
import { Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@ap/ui';
import { SegmentedRadio } from '../RadioGroup';
import { GroupEditor } from './GroupEditor';
import { personLabel, toggleMember, usePeopleSearch, type PeopleSearch } from './people';

export type ShareMode = 'private' | 'people' | 'groups' | 'official';
/** The unsaved choice. `official` asks for approval and leaves who can see the view unchanged. */
export type ShareTargetDraft = { mode: ShareMode; people: readonly GroupMember[]; groupIds: readonly string[] };

export type ShareGroupsState = { status: 'loading' | 'error' | 'ready'; entries: readonly ViewGroupEntry[]; retry: () => void };

export type ShareTargetPickerProps = {
  /** Display language; defaults to Korean for existing standalone consumers. */
  lang?: 'ko' | 'en';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Draft the picker starts from each time it opens. */
  value: ShareTargetDraft;
  groups: ShareGroupsState;
  currentUserId: string;
  searchPeople: PeopleSearch;
  onCreateGroup: (input: { name: string; memberIds: string[] }) => Promise<Result<ViewGroupEntry>>;
  onUpdateGroup: (id: string, patch: { name?: string; addMembers?: string[]; removeMembers?: string[] }) => Promise<Result<ViewGroupEntry>>;
  /** The only place sharing is decided; creating or saving a group never calls this. */
  onConfirm: (draft: ShareTargetDraft) => void | boolean | Promise<boolean | void>;
  /** Why the last confirm did not go through; shown in the picker, which stays open with the draft. */
  confirmError?: string | null;
};

export function ShareTargetPicker(props: ShareTargetPickerProps) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>{props.open && <PickerBody {...props} />}</Dialog>;
}

type EditorState = { kind: 'create'; members: readonly GroupMember[] } | { kind: 'edit'; id: string } | null;

function PickerBody({ lang = 'ko', onOpenChange, value, groups, currentUserId, searchPeople, onCreateGroup, onUpdateGroup, onConfirm, confirmError }: ShareTargetPickerProps) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ShareTargetDraft>(value);
  const [groupQuery, setGroupQuery] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  // Groups made here stay in the list even before the host's list catches up.
  const [made, setMade] = useState<readonly ViewGroupEntry[]>([]);
  const [lastMadeId, setLastMadeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const opener = useRef<HTMLElement | null>(null);
  // The control that had focus when the picker opened; focus goes back there when it closes.
  const trigger = useRef<HTMLElement | null>(null);
  // Mirrors lastMadeId for the close handler, which still holds the props of the render before the editor closed.
  const lastMade = useRef<string | null>(null);
  const openEditor = (next: EditorState) => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setEditor(next); };
  const people = usePeopleSearch(searchPeople, peopleQuery);
  // A caller that answers with a promise decides when the picker closes: `false` (or a throw) keeps it open with the draft and the choice.
  const confirm = async () => {
    const result = onConfirm(draft);
    if (!(result instanceof Promise)) { if (result !== false) onOpenChange(false); return; }
    setBusy(true);
    const done = await result.then(value => value !== false, () => false);
    setBusy(false);
    if (done) onOpenChange(false);
  };

  const entries = [...made.filter(m => !groups.entries.some(e => e.group.id === m.group.id)), ...groups.entries].map(e => made.find(m => m.group.id === e.group.id) ?? e);
  // While the host's list is loading or failed, only groups made here are known; they must still show up.
  const listed = groups.status === 'ready' ? entries : made;
  const needle = groupQuery.trim().toLowerCase();
  const shown = listed.filter(e => needle === '' || e.group.name.toLowerCase().includes(needle));
  const orgTeams = shown.filter(e => e.group.kind === 'org-team');
  const custom = shown.filter(e => e.group.kind === 'custom');
  const selectedGroups = draft.groupIds.map(id => entries.find(e => e.group.id === id)?.group.name ?? id);
  const known = [...draft.people, ...people.results];

  useEffect(() => {
    if (lastMadeId) rows.current.get(lastMadeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [lastMadeId, groupQuery, groups.status]);

  // After the editor closes: back to its opener, or (when the opener is gone) to the group it just made.
  const editorReturnFocus = (event: Event) => {
    const target = opener.current?.isConnected ? opener.current : rows.current.get(lastMade.current ?? '')?.querySelector<HTMLElement>('[role="checkbox"]') ?? null;
    if (target) { event.preventDefault(); target.focus(); }
  };
  const pickerReturnFocus = (event: Event) => {
    if (trigger.current?.isConnected) { event.preventDefault(); trigger.current.focus(); }
  };

  const created = (entry: ViewGroupEntry, kind: 'created' | 'updated') => {
    setMade(list => [...list.filter(m => m.group.id !== entry.group.id), entry]);
    if (kind === 'updated') return;
    // Only creates and selects: earlier group choices stay, and nothing is shared until the final save.
    setDraft(d => ({ ...d, mode: 'groups', groupIds: d.groupIds.includes(entry.group.id) ? d.groupIds : [...d.groupIds, entry.group.id] }));
    setGroupQuery('');
    lastMade.current = entry.group.id;
    setLastMadeId(entry.group.id);
    setNotice(groupCreatedText(entry.group.name, lang));
  };

  const toggleGroup = (id: string) => setDraft(d => ({ ...d, groupIds: d.groupIds.includes(id) ? d.groupIds.filter(x => x !== id) : [...d.groupIds, id] }));
  const summary = shareSummaryText(draft.mode, draft.people.length, draft.groupIds.length, selectedGroups, lang);
  const incomplete = (draft.mode === 'people' && draft.people.length === 0) || (draft.mode === 'groups' && draft.groupIds.length === 0);

  const renderGroup = (entry: ViewGroupEntry) => {
    const { group, capabilities } = entry;
    const checked = draft.groupIds.includes(group.id);
    return <li key={group.id} ref={node => { if (node) rows.current.set(group.id, node); else rows.current.delete(group.id); }} className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <Checkbox checked={checked} onCheckedChange={() => toggleGroup(group.id)} aria-label={`${group.name} (${memberCountText(group.memberCount, lang)})`} />
        <span className="truncate">{group.name}</span>
        <span className="text-xs text-text-secondary">{memberCountText(group.memberCount, lang)}</span>
        {!capabilities.canEditMembers && <span className="text-xs text-text-secondary">{word('membersLocked', lang)}</span>}
      </label>
      {(capabilities.canEditMembers || capabilities.canRename) && <Button type="button" variant="ghost" size="sm" aria-label={`${group.name} ${word('edit', lang)}`} onClick={() => openEditor({ kind: 'edit', id: group.id })}>{word('edit', lang)}</Button>}
    </li>;
  };

  const editing = editor?.kind === 'edit' ? entries.find(e => e.group.id === editor.id) : undefined;

  return <DialogContent className="max-w-lg" closeLabel={word('close', lang)}
    onOpenAutoFocus={() => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
    onCloseAutoFocus={pickerReturnFocus}>
    <DialogHeader>
      <DialogTitle>{word('shareTitle', lang)}</DialogTitle>
      <DialogDescription>{word('shareBody', lang)}</DialogDescription>
    </DialogHeader>
    <SegmentedRadio label={word('shareMode', lang)} value={draft.mode} options={(['private', 'people', 'groups', 'official'] as const).map(value => ({ value, label: word(value === 'private' ? 'private' : value === 'people' ? 'peopleMode' : value === 'groups' ? 'groupsMode' : 'officialMode', lang) }))} onChange={mode => setDraft(d => ({ ...d, mode }))} />

    {draft.mode === 'people' && <div className="grid gap-2">
      <ul className="flex flex-wrap gap-1" aria-label={word('selectedPeople', lang)}>
        {draft.people.map(p => <li key={p.userId}><Badge variant="secondary">
          <span>{personLabel(p, known)}</span>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`${personLabel(p, known)} ${word('removePerson', lang)}`} onClick={() => setDraft(d => ({ ...d, people: toggleMember(d.people, p) }))}><X className="h-3 w-3" aria-hidden="true" /></Button>
        </Badge></li>)}
      </ul>
      <label className="text-xs font-semibold" htmlFor="share-people-search">{word('peopleSearch', lang)}</label>
      <Input id="share-people-search" value={peopleQuery} placeholder={word('peoplePlaceholder', lang)} onChange={event => setPeopleQuery(event.target.value)} />
      <div aria-live="polite">
        {people.status === 'loading' && <p className="text-xs text-text-secondary">{word('searching', lang)}</p>}
        {people.status === 'error' && <p role="alert" className="text-xs text-text-danger-label">{word('searchFailed', lang)} <Button type="button" variant="link" size="sm" onClick={people.retry}>{word('retry', lang)}</Button></p>}
        {people.status === 'ready' && people.results.length === 0 && <p className="text-xs text-text-secondary">{word('searchEmpty', lang)}</p>}
      </div>
      <ul className="grid max-h-40 gap-1 overflow-auto" aria-label={word('searchResults', lang)}>
        {people.results.map(p => <li key={p.userId}><label className="flex items-center gap-2 text-sm">
          <Checkbox checked={draft.people.some(x => x.userId === p.userId)} onCheckedChange={() => setDraft(d => ({ ...d, people: toggleMember(d.people, p) }))} aria-label={personLabel(p, known)} />
          <span>{p.displayName}</span><span className="text-xs text-text-secondary">{p.affiliation}</span>
        </label></li>)}
      </ul>
      <Button type="button" variant="outline" size="sm" disabled={draft.people.length === 0} onClick={() => openEditor({ kind: 'create', members: draft.people })}>{word('savePeopleGroup', lang)}</Button>
    </div>}

    {draft.mode === 'groups' && <div className="grid gap-2">
      <label className="text-xs font-semibold" htmlFor="share-group-search">{word('groupSearch', lang)}</label>
      <Input id="share-group-search" value={groupQuery} placeholder={word('groupPlaceholder', lang)} onChange={event => setGroupQuery(event.target.value)} />
      <div className="grid max-h-56 gap-2 overflow-auto" aria-busy={groups.status === 'loading'}>
        {groups.status === 'loading' && <p role="status" className="text-xs text-text-secondary">{word('groupsLoading', lang)}</p>}
        {groups.status === 'error' && <p role="alert" className="text-xs text-text-danger-label">{word('groupsFailed', lang)} <Button type="button" variant="link" size="sm" onClick={groups.retry}>{word('retry', lang)}</Button></p>}
        {groups.status === 'ready' && shown.length === 0 && <p role="status" className="text-xs text-text-secondary">{needle === '' ? word('groupsEmpty', lang) : word('searchEmpty', lang)}</p>}
        {shown.length > 0 && <>
          <section aria-label={word('orgTeams', lang)}><h3 className="text-xs font-semibold">{word('orgTeams', lang)}</h3>
            <ul className="grid gap-1">{orgTeams.map(renderGroup)}</ul>
            {groups.status === 'ready' && orgTeams.length === 0 && <p className="text-xs text-text-secondary">{word('orgTeamsEmpty', lang)}</p>}</section>
          <section aria-label={word('customGroups', lang)}><h3 className="text-xs font-semibold">{word('customGroups', lang)}</h3>
            <ul className="grid gap-1">{custom.map(renderGroup)}</ul>
            {groups.status === 'ready' && custom.length === 0 && <p className="text-xs text-text-secondary">{word('customGroupsEmpty', lang)}</p>}</section>
        </>}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => openEditor({ kind: 'create', members: [] })}>{word('createGroup', lang)}</Button>
    </div>}

    {draft.mode === 'official' && <p className="text-xs text-text-secondary">{word('officialNotice', lang)}</p>}

    <p role="status" aria-label={word('selectionSummary', lang)} className="text-sm">{summary}</p>
    {notice && <p role="status" className="text-xs text-text-secondary">{notice}</p>}

    {confirmError && <p role="alert" className="text-xs text-text-danger-label">{confirmError}</p>}

    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{word('cancel', lang)}</Button>
      <Button type="button" disabled={incomplete || busy} onClick={() => { void confirm(); }}>{word('saveTargets', lang)}</Button>
    </DialogFooter>

    <GroupEditor
      lang={lang}
      open={editor !== null && (editor.kind === 'create' || editing !== undefined)}
      onOpenChange={next => { if (!next) setEditor(null); }}
      {...(editing ? { entry: editing } : {})}
      {...(editor?.kind === 'create' ? { initialMembers: editor.members } : {})}
      currentUserId={currentUserId}
      searchPeople={searchPeople}
      onCreate={onCreateGroup}
      onUpdate={onUpdateGroup}
      onDone={created}
      onCloseAutoFocus={editorReturnFocus}
    />
  </DialogContent>;
}
