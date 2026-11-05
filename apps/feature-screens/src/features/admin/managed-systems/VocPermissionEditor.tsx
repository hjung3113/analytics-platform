import { Button, Callout, Input, RadioGroup, RadioGroupItem } from '@ap/ui';
import { LockKeyhole, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { formatDateTime } from '@/lib/format/datetime';
import type { SystemPermissionRow } from './VocPermissions';
import { sameVocSetting, vocSettingLabel, type useVocPermissions, type VocMode } from './useVocPermissions';

type Console = ReturnType<typeof useVocPermissions>;
export function VocPermissionEditor({ row, state }: { row: SystemPermissionRow; state: Console }) {
  const [query, setQuery] = useState('');
  const id = useId();
  const saved = state.saved(row.id, row.platform);
  const draft = state.drafts[row.id] ?? saved;
  const dirty = !sameVocSetting(draft, saved);
  const locked = row.platform || row.archived || state.busy || !state.ready || !state.known(row.id);
  const actors = state.actors.actors ?? [];
  const name = (actorId: string) => actors.find(a => a.id === actorId)?.display_name ?? `사용자 · ${actorId}`;
  const candidates = actors.filter(a => a.actor_type !== 'system' && a.role_level !== 'admin' && !draft.people.includes(a.id) && a.display_name.includes(query.trim()));
  const error = state.errors[row.id];
  return <section aria-label={`${row.name} VOC 등록 권한`} className="flex h-full min-h-0 flex-col gap-3">
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-text-secondary">저장됨 · {state.ready && state.known(row.id) ? vocSettingLabel(saved) : '확인 필요'}</p>
        {dirty && <p className="text-xs font-medium text-text-warning-label">미저장 · {vocSettingLabel(draft)}</p>}
        <h3 className="text-sm font-semibold">VOC 등록 권한</h3>
        <RadioGroup aria-label="VOC 등록 대상" value={draft.mode} disabled={locked} onValueChange={mode => state.change(row.id, { ...draft, mode: mode as VocMode })}>
          <div className="flex items-center gap-2"><RadioGroupItem id={`${id}-open`} value="open" /><label htmlFor={`${id}-open`} className="text-sm">모두</label></div>
          <div className="flex items-center gap-2"><RadioGroupItem id={`${id}-restricted`} value="restricted" /><label htmlFor={`${id}-restricted`} className="text-sm">지정한 사람만</label></div>
        </RadioGroup>
        {row.platform && <p className="flex items-start gap-2 text-xs text-text-secondary"><LockKeyhole className="size-4 shrink-0" aria-hidden />플랫폼은 모든 사용자의 VOC를 받으므로 항상 모두로 유지합니다.</p>}
        {!state.known(row.id) && <p role="alert" className="text-sm text-text-danger-label">추적 시스템이 목록에 없습니다. 설정을 다시 불러오세요.</p>}
      {row.archived && <p className="text-xs text-text-secondary">보관된 시스템은 수정할 수 없습니다.</p>}
        <p className="text-xs text-text-secondary">Admin은 별도 지정 없이 등록할 수 있습니다. 명시적인 거부 권한은 우선 적용됩니다.</p>
        <p className="text-xs text-text-muted">새 VOC 등록에만 적용됩니다. 기존 VOC는 영향을 받지 않습니다.</p>
        <p className="text-xs text-text-muted">워크스페이스 전체 VOC 등록 권한도 적용됩니다. 여기서는 이 추적 시스템에 직접 부여한 사람만 관리합니다.</p>
      </div>
      {draft.mode === 'restricted' && <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">등록할 수 있는 사람</h4><span className="text-xs text-text-muted">{draft.people.length}명 · Admin 별도</span></div>
        {draft.people.length === 0 && <Callout tone="amber" title="등록할 사람이 없습니다"><p>지정한 사람이 없어 Admin만 등록할 수 있습니다. 워크스페이스 전체 부여·명시적 거부는 별도로 적용됩니다.</p></Callout>}
        {draft.people.length > 0 && <table className="w-full text-left text-xs">
          <caption className="sr-only">지정한 사람 목록</caption>
          <thead className="text-text-secondary"><tr><th scope="col" className="py-1">이름</th><th scope="col">역할</th><th scope="col">부여일</th><th scope="col"><span className="sr-only">제거</span></th></tr></thead>
          <tbody>{draft.people.map(actorId => {
            const actor = actors.find(a => a.id === actorId);
            const grant = state.scopedGrants(row.id).find(g => g.actor_id === actorId);
            return <tr key={actorId} className="border-t border-border-subtle">
              <td className="max-w-40 break-words py-1 pr-2">{name(actorId)}</td>
              <td>{actor ? actor.role_level === 'admin' ? 'Admin' : actor.role_level === 'developer' ? 'Developer' : 'User' : '확인 필요'}</td>
              <td>{grant ? formatDateTime(grant.granted_at) : '미저장'}</td>
              <td className="text-right"><Button size="icon-sm" variant="subtle" aria-label={`${name(actorId)} 제거`} disabled={locked} onClick={() => state.change(row.id, { ...draft, people: draft.people.filter(p => p !== actorId) })}><X aria-hidden /></Button></td>
            </tr>;
          })}</tbody>
        </table>}
        {!row.platform && !row.archived && <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-search`} className="text-xs font-medium">이름으로 사람 추가</label>
          <Input id={`${id}-search`} aria-label="추가할 사람 이름 검색" placeholder="이름 검색" value={query} disabled={locked} onChange={event => setQuery(event.target.value)} />
          {state.actors.isPending ? <p role="status" className="text-xs text-text-muted">사람을 불러오는 중…</p> : state.actors.isError ? <div role="alert"><p>사람을 불러오지 못했습니다.</p><Button size="sm" variant="secondary" onClick={() => void state.actors.refetch()}>사람 다시 불러오기</Button></div> : <div>
            {candidates.map(actor => <div key={actor.id} className="flex items-center justify-between gap-2 border-b border-border-subtle py-1 text-xs">
              <span className="min-w-0 break-words">{actor.display_name} · {actor.role_level === 'developer' ? 'Developer' : 'User'}</span>
              <Button size="sm" variant="subtle" aria-label={`${actor.display_name} 추가`} disabled={locked} onClick={() => { state.change(row.id, { ...draft, people: [...draft.people, actor.id] }); setQuery(''); }}><Plus aria-hidden />추가</Button>
            </div>)}
            {candidates.length === 0 && <p className="py-2 text-xs text-text-muted">{query.trim() ? `‘${query.trim()}’와 일치하는 사람이 없습니다` : '추가 가능한 사람을 모두 지정했습니다'}</p>}
          </div>}
        </div>}
      </div>}
      {error && <p role="alert" className="text-sm text-text-danger-label">{error}</p>}
      {!state.ready && <div role="alert"><p>저장된 설정을 확인하지 못했습니다.</p><Button size="sm" variant="secondary" disabled={state.busy} onClick={() => void state.refresh()}>설정 다시 불러오기</Button></div>}
    </div>
    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle pt-3">
      {dirty && <Button size="sm" variant="subtle" disabled={state.busy} onClick={() => state.clearDraft(row.id)}>초안 버리기</Button>}
      <Button size="sm" disabled={locked || (!dirty && !error)} onClick={() => void state.save(row.id, row.platform)}>{state.busy ? '저장 중…' : '저장'}</Button>
    </footer>
  </section>;
}
