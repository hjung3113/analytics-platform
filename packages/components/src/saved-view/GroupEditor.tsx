import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { GroupMember, Result, ViewGroupEntry } from '@ap/contracts';
import { Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@ap/ui';
import { personLabel, toggleMember, usePeopleSearch, type PeopleSearch } from './people';

export type GroupEditorProps = {
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

const REASON: Record<'conflict' | 'forbidden' | 'unavailable' | 'invalid', string> = {
  conflict: '다른 곳에서 먼저 바뀌었습니다. 다시 열어 확인하세요.',
  forbidden: '이 그룹을 바꿀 권한이 없습니다.',
  unavailable: '저장하지 못했습니다. 잠시 뒤 다시 시도하세요.',
  invalid: '이름이나 멤버를 확인하세요.',
};

/** State resets every time `open` turns true; nothing is kept between openings. */
export function GroupEditor(props: GroupEditorProps) {
  const { open, onOpenChange } = props;
  return <Dialog open={open} onOpenChange={onOpenChange}>{open && <EditorBody {...props} />}</Dialog>;
}

function EditorBody({ onOpenChange, entry, initialMembers, currentUserId, searchPeople, onCreate, onUpdate, onDone, onCloseAutoFocus }: GroupEditorProps) {
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
    if (trimmed === '') { setError('그룹 이름을 입력하세요.'); return; }
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
      if (mounted.current) { setBusy(false); setError(REASON.unavailable); }
      return;
    }
    if (mounted.current) setBusy(false);
    // A failed or conflicting call keeps the typed name and the chosen members.
    if (!result.ok) { if (mounted.current) setError(result.detail ?? REASON[result.reason]); return; }
    // The group exists even if the editor was cancelled meanwhile; only a still-open editor closes itself.
    onDone(result.value, editing ? 'updated' : 'created');
    if (mounted.current) onOpenChange(false);
  };

  return <DialogContent className="max-w-md" closeLabel="닫기" {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}>
    <DialogHeader>
      <DialogTitle>{editing ? '그룹 편집' : '새 그룹 만들기'}</DialogTitle>
      <DialogDescription>{editing ? '이름과 멤버를 바꿉니다.' : '멤버는 직접 고른 사람만 들어갑니다. 만들어도 뷰는 아직 공유되지 않습니다.'}</DialogDescription>
    </DialogHeader>
    <div className="grid gap-1">
      <label htmlFor={nameId} className="text-xs font-semibold">그룹 이름</label>
      <Input id={nameId} value={name} disabled={!canRename} onChange={event => setName(event.target.value)} />
    </div>
    <p className="text-xs text-text-secondary" data-testid="group-role">
      {isManager ? '관리 권한: 있음' : '관리 권한: 없음'} · {iAmMember ? '멤버: 포함' : '멤버: 포함 안 됨'}
      {!editing && !iAmMember && ' (만든 사람은 관리자이며, 멤버에는 직접 추가해야 들어갑니다)'}
    </p>
    {editing && entry.group.kind === 'org-team' && <p className="text-xs text-text-secondary">조직 팀은 멤버를 편집할 수 없습니다.</p>}
    <ul className="flex flex-wrap gap-1" aria-label="선택한 멤버">
      {members.map(member => <li key={member.userId}><Badge variant="secondary">
        <span>{personLabel(member, known)}</span>
        {!readOnlyMembers && <Button type="button" variant="ghost" size="icon-xs" aria-label={`${personLabel(member, known)} 제거`} onClick={() => setMembers(list => toggleMember(list, member))}><X className="h-3 w-3" aria-hidden="true" /></Button>}
      </Badge></li>)}
      {members.length === 0 && <li className="text-xs text-text-secondary">아직 고른 멤버가 없습니다.</li>}
    </ul>
    {!readOnlyMembers && <div className="grid gap-1">
      <label htmlFor={searchId} className="text-xs font-semibold">멤버 검색</label>
      <Input id={searchId} value={query} placeholder="이름 또는 소속(공정·팀)으로 검색" onChange={event => setQuery(event.target.value)} />
      <div aria-live="polite">
        {search.status === 'loading' && <p className="text-xs text-text-secondary">검색 중…</p>}
        {search.status === 'error' && <p role="alert" className="text-xs text-text-danger-label">검색하지 못했습니다. <Button type="button" variant="link" size="sm" onClick={search.retry}>다시 시도</Button></p>}
        {search.status === 'ready' && search.results.length === 0 && <p className="text-xs text-text-secondary">검색 결과가 없습니다.</p>}
      </div>
      <ul className="grid max-h-40 gap-1 overflow-auto" aria-label="검색 결과">
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
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
      <Button type="button" disabled={busy} onClick={() => void submit()}>{editing ? '변경 저장' : '그룹 만들기'}</Button>
    </DialogFooter>
  </DialogContent>;
}
