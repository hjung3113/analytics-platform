import type { PermissionGrantAdminItem } from '@ap/feature-shared';
import { managedSystemListSchema } from '@ap/feature-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { apiRequest } from '@/lib/api/client';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import { fetchPermissionGrants } from '@/lib/api/permission-admin';
import { VOC_CREATE_TARGETS_QUERY_KEY } from '@/lib/api/voc-create-targets';
import type { ManagedSystemDto } from '@/lib/api/registry-reads';
import { updateManagedSystem } from '@/lib/api/registry-writes';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { envelopeMessage } from '../lib/envelopeMessage';
import { useDirectPermissionGrant } from '../permissions/useDirectPermissionGrant';
import { permissionGrantsListKey, useRevokePermission } from '../permissions/useRevokePermission';

export type VocMode = 'open' | 'restricted';
export type VocSetting = { mode: VocMode; people: string[] };
const systemsKey = ['managed-systems', 'voc-permissions'] as const;
export const sameVocSetting = (a: VocSetting, b: VocSetting) => a.mode === b.mode && a.people.length === b.people.length && a.people.every(id => b.people.includes(id));
export const vocSettingLabel = (setting: VocSetting) => setting.mode === 'open' ? '모두' : `지정 ${setting.people.length}명`;

async function fetchSystems(signal: AbortSignal): Promise<ManagedSystemDto[]> {
  const items: ManagedSystemDto[] = [];
  for (;;) {
    const response = await apiRequest('GET', `/managed-systems?include_archived=true&limit=500&offset=${items.length}`, managedSystemListSchema, { signal });
    const page = response.data as unknown as { items: ManagedSystemDto[]; total: number };
    if (page.items.length === 0 && items.length < page.total) throw new Error('시스템 목록이 불완전합니다. 다시 불러오세요.');
    items.push(...page.items);
    if (items.length >= page.total) return items;
  }
}

export function useVocPermissions() {
  const client = useQueryClient();
  const systems = useQuery({ queryKey: systemsKey, queryFn: ({ signal }) => fetchSystems(signal), retry: false });
  const grants = useQuery({ queryKey: permissionGrantsListKey, queryFn: ({ signal }) => fetchPermissionGrants(signal), retry: false });
  const actors = useWorkspaceActors({ retry: false });
  const [drafts, setDrafts] = useState<Record<string, VocSetting>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<Record<string, VocMode> | null>(null);
  const running = useRef(false);
  // The mode each draft started from; a save writes the mode only when the admin changed it (a concurrent change by someone else is kept, not reverted).
  const baselines = useRef(new Map<string, VocMode>());
  // The mode the last bulk wrote per system; undo applies only while the server still holds it.
  const applied = useRef<Record<string, VocMode>>({});
  // A failed request reuses its key until a refetch (or its own success) confirms the intent, the intent is dropped from the draft, or the screen is left.
  const intents = useRef(new Map<string, string>());
  const keyFor = (intent: string) => {
    let key = intents.current.get(intent);
    if (!key) { key = mintIdempotencyKey(); intents.current.set(intent, key); }
    return key;
  };
  const cacheGrant = (item: PermissionGrantAdminItem) => client.setQueryData<PermissionGrantAdminItem[]>(permissionGrantsListKey, current => [...(current ?? []).filter(g => g.id !== item.id), item]);
  const add = useDirectPermissionGrant(cacheGrant);
  const remove = useRevokePermission(id => client.setQueryData<PermissionGrantAdminItem[]>(permissionGrantsListKey, current => (current ?? []).filter(g => g.id !== id)));
  const activeGrants = (grants.data ?? []).filter(g => g.capability === 'voc.create' && (g.expires_at === null || Date.parse(g.expires_at) > Date.now()));
  const scopedGrants = (id: string) => activeGrants.filter(g => g.managed_system_id === id);
  const saved = (id: string, platform = false): VocSetting => ({
    mode: platform ? 'open' : systems.data?.find(s => s.id === id)?.voc_create_mode ?? 'open',
    people: [...new Set(scopedGrants(id).map(g => g.actor_id))],
  });
  const known = (id: string) => systems.data?.some(system => system.id === id) === true;
  const ready = systems.isSuccess && !systems.isError && grants.isSuccess && !grants.isError;
  const clearDraft = (id: string) => {
    baselines.current.delete(id);
    setDrafts(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
  };
  const change = (id: string, setting: VocSetting) => {
    if (running.current) return;
    if (!baselines.current.has(id)) baselines.current.set(id, saved(id).mode);
    setDrafts(current => ({ ...current, [id]: setting }));
  };
  const refresh = async () => { await Promise.all([systems.refetch(), grants.refetch()]); };
  async function patchMode(id: string, mode: VocMode) {
    const intent = `mode:${id}:${mode}`;
    const result = await updateManagedSystem(id, { voc_create_mode: mode }, { idempotencyKey: keyFor(intent) });
    intents.current.delete(intent);
    // The cache takes what the server answered; a different answer is a failure, never a saved state.
    client.setQueryData<ManagedSystemDto[]>(systemsKey, current => current?.map(s => s.id === id ? { ...s, ...result } : s));
    if (result.voc_create_mode !== mode) throw new Error(`서버가 다른 등록 모드(${result.voc_create_mode === 'open' ? '모두' : '지정한 사람만'})를 반환했습니다`);
  }
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['platform', 'systems-overview'] });
    void client.invalidateQueries({ queryKey: VOC_CREATE_TARGETS_QUERY_KEY });
    void client.invalidateQueries({ queryKey: ['permission-check'] });
    void client.invalidateQueries({ queryKey: systemsKey });
    void client.invalidateQueries({ queryKey: permissionGrantsListKey });
  };
  const editableIn = (list: ManagedSystemDto[] | undefined, id: string) => {
    const target = list?.find(s => s.id === id);
    return target !== undefined && target.external_key !== 'platform' && target.archived_at === null;
  };
  const editable = (id: string) => editableIn(systems.data, id);
  async function save(id: string, platform: boolean) {
    if (running.current || !ready || platform || !editable(id)) return;
    const draft = drafts[id];
    if (!draft) return;
    running.current = true; setBusy(true); setNotice('');
    const completed: string[] = [];
    let step = '저장된 사람 확인';
    try {
      // Refresh before calculating the diff. A retry never repeats a confirmed add/revoke.
      const fresh = await grants.refetch();
      if (fresh.isError || !fresh.data) throw fresh.error ?? new Error('저장된 사람을 확인하지 못했습니다');
      const current = fresh.data.filter(g => g.capability === 'voc.create' && g.managed_system_id === id && (g.expires_at === null || Date.parse(g.expires_at) > Date.now()));
      const toAdd = draft.people.filter(actorId => !current.some(g => g.actor_id === actorId));
      const toRemove = current.filter(g => !draft.people.includes(g.actor_id));
      // An add/remove the refetch shows as done, or that the draft no longer wants, is over: its key must not outlive it (a later re-add is a new request).
      for (const intent of [...intents.current.keys()]) {
        if (intent.startsWith(`add:${id}:`) && !toAdd.includes(intent.slice(`add:${id}:`.length))) intents.current.delete(intent);
        if (intent.startsWith(`remove:${id}:`) && !toRemove.some(g => `remove:${id}:${g.id}` === intent)) intents.current.delete(intent);
      }
      for (const actorId of toAdd) {
        step = '사람 추가';
        const intent = `add:${id}:${actorId}`;
        await add.mutateAsync({ body: { actor_id: actorId, capability: 'voc.create', managed_system_id: id, reason: '시스템 VOC 등록 권한 설정' }, idempotencyKey: keyFor(intent) });
        intents.current.delete(intent); completed.push('사람 추가 1건');
      }
      for (const grant of toRemove) {
        step = '사람 제거';
        const intent = `remove:${id}:${grant.id}`;
        await remove.mutateAsync({ kind: 'grants', id: grant.id, reason: '시스템 VOC 등록 권한 설정에서 제거', idempotencyKey: keyFor(intent) });
        intents.current.delete(intent); completed.push('사람 제거 1건');
      }
      step = '등록 모드 저장';
      // Compare with the latest server mode, never the cached one; write it only when the admin changed it from where the draft started.
      const latest = await systems.refetch();
      const server = latest.data?.find(s => s.id === id);
      if (latest.isError || !server) throw latest.error ?? new Error('시스템의 현재 등록 모드를 확인하지 못했습니다');
      const changedByAdmin = draft.mode !== (baselines.current.get(id) ?? draft.mode);
      let kept = false;
      if (server.voc_create_mode !== draft.mode) {
        if (changedByAdmin) { await patchMode(id, draft.mode); completed.push('등록 모드 저장'); }
        else kept = true;
      }
      clearDraft(id);
      setUndo(current => current?.[id] !== undefined ? null : current);
      setNotice(kept ? `사람 변경을 저장했습니다. 다른 관리자가 등록 모드를 바꿔 서버 값을 유지했습니다(${server.voc_create_mode === 'open' ? '모두' : '지정한 사람만'}).` : 'VOC 등록 권한을 저장했습니다.');
    } catch (error) {
      setErrors(current => ({ ...current, [id]: `${step} 실패: ${envelopeMessage(error)} 완료: ${completed.join(', ') || '없음'}. 일부 변경이 반영되었을 수 있습니다. 초안을 유지했습니다. 저장을 눌러 다시 시도하세요.` }));
      await refresh();
    } finally { invalidate(); running.current = false; setBusy(false); }
  }
  async function bulk(targets: { id: string; platform: boolean }[], mode: VocMode | null) {
    if (running.current || !ready) return false;
    const previous: Record<string, VocMode> = {};
    const failed = new Map<string, string>();
    const changedElsewhere: string[] = [];
    const values = mode === null ? undo : Object.fromEntries(targets.filter(t => !t.platform && editable(t.id)).map(t => [t.id, mode]));
    if (!values) return false;
    running.current = true; setBusy(true); setNotice('');
    // Decide every system against the latest server modes, not the cached list.
    const latest = await systems.refetch();
    const list = latest.isError ? undefined : latest.data;
    const nameOf = (id: string) => list?.find(s => s.id === id)?.name ?? systems.data?.find(s => s.id === id)?.name ?? id;
    for (const [id, next] of Object.entries(values)) {
      if (list === undefined) { failed.set(id, `${nameOf(id)}: 시스템의 현재 등록 모드를 확인하지 못했습니다`); continue; }
      if (!editableIn(list, id)) { failed.set(id, `${nameOf(id)}: 수정할 수 없는 시스템`); continue; }
      const before = list.find(s => s.id === id)?.voc_create_mode ?? 'open';
      // Undo only restores a system the server still holds as this bulk left it.
      if (mode === null && before !== applied.current[id]) { changedElsewhere.push(nameOf(id)); continue; }
      if (before === next) continue;
      try { await patchMode(id, next); previous[id] = before; if (mode !== null) applied.current[id] = next; }
      catch (error) { failed.set(id, `${nameOf(id)}: ${envelopeMessage(error)}`); }
    }
    // Keep failed undo entries retryable; a new bulk operation replaces the previous snapshot.
    if (mode !== null) applied.current = { ...Object.fromEntries(Object.keys(previous).map(id => [id, mode])) };
    setUndo(mode === null ? Object.fromEntries(Object.entries(values).filter(([id]) => failed.has(id))) : previous);
    const elsewhere = changedElsewhere.length > 0 ? ` 다른 관리자가 먼저 바꿔 되돌리지 않음: ${changedElsewhere.join(', ')}.` : '';
    setNotice(failed.size > 0 ? `일괄 변경 실패 · ${[...failed.values()].join(' / ')}. 완료 ${Object.keys(previous).length}개. 완료된 변경은 되돌릴 수 있습니다.${elsewhere}` : mode === null ? `일괄 변경을 되돌렸습니다.${elsewhere}` : `${Object.keys(previous).length}개 시스템의 등록 모드를 저장했습니다.`);
    if (failed.size > 0) await refresh();
    invalidate(); running.current = false; setBusy(false);
    return failed.size === 0;
  }
  return { systems, grants, actors, ready, known, saved, scopedGrants, activeGrants, drafts, change, clearDraft, errors, busy, notice, undo, save, bulk, refresh };
}
