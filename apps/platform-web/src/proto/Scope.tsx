// THROWAWAY #595 — never merge.
// Managed System picker: variant A draws it in the sidebar's scope slot ("업무 시스템"), variant B in the screen header's right side.
import { ChevronDown, Shield } from 'lucide-react';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@ap/ui';
import { usePlatform } from '@ap/kernel';
import { ALL_SYSTEMS, isGranted, MANAGED_SYSTEMS, PROTO, SCOPE_ALL, setEntry, useEntry } from './state';

export function ScopeDropdown({ layout, collapsed = false }: { layout: 'sidebar' | 'bar'; collapsed?: boolean }) {
  const { ms } = useEntry();
  const bar = layout === 'bar';
  const trigger = <DropdownMenuTrigger asChild>
    <button type="button" aria-label={`업무 시스템: ${ms}`}
      className={cn('flex items-center gap-2 rounded-md border border-border-control px-2 text-left text-sm hover:bg-surface-row-hover', bar ? 'h-8' : 'min-h-10 w-full py-2')}>
      {bar ? <><span className="text-text-muted">업무 시스템:</span><span className="font-medium">{ms}</span></>
        : <><span className="grid size-5 shrink-0 place-items-center rounded bg-accent-primary-soft text-xs font-semibold text-accent-primary" aria-hidden>{ms.slice(0, 1)}</span>
          <span className={cn('min-w-0 flex-1 truncate font-medium', collapsed && 'sr-only')}>{ms}</span></>}
      {!collapsed && <ChevronDown className="size-3 shrink-0 text-text-muted" aria-hidden />}
    </button>
  </DropdownMenuTrigger>;
  return <div className={bar ? 'shrink-0' : 'shrink-0 border-b border-border-subtle p-2'}>
    {!bar && !collapsed && <p className="mx-1 mb-1 text-caption font-semibold text-text-muted">업무 시스템</p>}
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent align={bar ? 'end' : 'start'} className="w-64">
        <DropdownMenuLabel>업무 시스템 (Managed System)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={ms} onValueChange={v => setEntry({ ms: v })}>
          <DropdownMenuRadioItem value={ALL_SYSTEMS}><span className="flex-1">{ALL_SYSTEMS}</span><span className="text-tiny text-text-secondary">관리자</span></DropdownMenuRadioItem>
          {MANAGED_SYSTEMS.map(name => <DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

/** Variant A's scope: current value from the URL key `managedSystem` (absent = 전체). */
export function useScopeValue(): string {
  const { pageParam } = usePlatform();
  const entry = useEntry();
  return PROTO.variant === 'A' ? (pageParam('managedSystem') ?? SCOPE_ALL) : entry.ms;
}

/** Systems whose rows a list shows for a scope value: 전체 = my union (admin: all). */
export function scopedSystems(value: string): string[] {
  if (value === SCOPE_ALL || value === ALL_SYSTEMS) return MANAGED_SYSTEMS.filter(isGranted);
  return [value];
}

/** Variant A: the picker follows FeedbackOps' original scope semantics (전체 = union of my scope, 범위 밖 dimmed), URL-owned. */
export function ScopePicker({ collapsed }: { collapsed: boolean }) {
  const { route, setPage } = usePlatform();
  const value = useScopeValue();
  const admin = PROTO.persona !== 'developer';
  const supported = route?.menu.group !== 'foAdmin';
  const granted = MANAGED_SYSTEMS.filter(isGranted);
  const selectedOut = value !== SCOPE_ALL && !isGranted(value);
  const name = supported ? value : '워크스페이스 전체';
  const qualifier = !supported ? null : selectedOut ? '범위 밖' : value === SCOPE_ALL ? (admin ? '워크스페이스 전체' : `내 담당: ${granted.join(' · ')}`) : null;
  const trigger = <DropdownMenuTrigger asChild disabled={!supported}>
    <button type="button" disabled={!supported} aria-label={`목록 범위: ${qualifier ? `${name}, ${qualifier}` : name}`}
      title={supported ? name : '이 화면은 Managed System 범위를 지원하지 않습니다'}
      className={cn('flex min-h-10 w-full items-center gap-2 rounded-md border border-border-control px-2 py-2 text-left text-sm', supported ? 'hover:bg-surface-row-hover' : 'cursor-not-allowed opacity-60')}>
      <span className="grid size-5 shrink-0 place-items-center rounded bg-accent-primary-soft text-xs font-semibold text-accent-primary" aria-hidden>{value === SCOPE_ALL || !supported ? '∗' : value.slice(0, 1)}</span>
      <span className={cn('flex min-w-0 flex-1 flex-col', collapsed && 'sr-only')}>
        <span className="flex min-w-0 items-center gap-1 font-medium"><span className="min-w-0 truncate">{name}</span>{supported && selectedOut && <span className="shrink-0 rounded-pill bg-accent-danger-soft px-1.5 text-caption font-semibold text-text-danger-label">범위 밖</span>}</span>
        {supported && value === SCOPE_ALL && <span className="block truncate text-caption text-text-muted">{qualifier}</span>}
      </span>
      {supported && !collapsed && <ChevronDown className="size-3 shrink-0 text-text-muted" aria-hidden />}
    </button>
  </DropdownMenuTrigger>;
  return <div className="shrink-0 border-b border-border-subtle p-2">
    {!collapsed && <p className="mx-1 mb-1 text-caption font-semibold text-text-muted">목록 범위</p>}
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>목록 범위 · 업무 시스템(Managed System)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={v => setPage({ managedSystem: v === SCOPE_ALL ? null : v })}>
          <DropdownMenuRadioItem value={SCOPE_ALL}><span className="flex flex-col"><span className="font-medium">{SCOPE_ALL}</span>
            <span className="text-caption text-text-muted">{admin ? '워크스페이스 전체' : `내 담당 ${granted.length} / ${MANAGED_SYSTEMS.length}`}</span></span></DropdownMenuRadioItem>
          {MANAGED_SYSTEMS.map(system => <DropdownMenuRadioItem key={system} value={system}>
            <span className={cn('flex-1', !isGranted(system) && 'opacity-55')}>{system}</span>{!isGranted(system) && <><Shield className="size-3 text-text-muted" aria-hidden /><span className="ml-1 text-caption text-text-muted">범위 밖</span></>}
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {!admin && <p className="px-2 py-1.5 text-caption text-text-muted">이름은 워크스페이스 전체에 공개되며, 접근하려면 권한을 요청하세요.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
