import { useId } from 'react';
import { ChevronDown, Loader2, MapPin, RotateCw, ShieldAlert } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';

/** Single requested Scope; validation and retries belong to the Kernel. */
export function ScopeSelector({ collapsed = false }: { collapsed?: boolean }) {
  const { global, setGlobal, scope, retryScope, session } = usePlatform();
  const { t, lang } = useI18n();
  const current = session.scopes.find(s => s.id === global.scopeId);
  const name = current?.label ?? global.scopeId ?? t('scopeNone');
  const descriptionId = useId();
  const status = scope.status === 'none' ? t('scopeNone') : scope.status === 'valid' ? t('scopeValid')
    : scope.status === 'validating' ? t('scopeValidating') : scope.status === 'unknown_scope' ? t('scopeUnknown')
      : scope.status === 'error' ? t('scopeCheckFailed') : t('scopeForbidden');
  const warn = !['none', 'valid', 'validating'].includes(scope.status);
  const trigger = <DropdownMenuTrigger asChild>
    <button type="button" aria-label={`${t('scope')}: ${current?.label ?? global.scopeId ?? t('scopeNone')}`}
      aria-describedby={descriptionId}
      className="flex min-h-10 w-full items-center gap-2 rounded-md border border-border-control px-2 py-2 text-left text-sm hover:bg-surface-row-hover">
      <span className={cn('grid size-5 shrink-0 place-items-center rounded text-xs font-semibold', warn ? 'bg-accent-warn-soft text-warning-label' : 'bg-accent-primary-soft text-accent-primary')}>
        {scope.status === 'validating' ? <Loader2 className="size-3 animate-spin" aria-hidden />
          : scope.status === 'none' ? <MapPin className="size-3" aria-hidden />
            : warn ? <ShieldAlert className="size-3" aria-hidden /> : <span aria-hidden>{name.slice(0, 1)}</span>}
      </span>
      <span className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
        <span className="block truncate font-medium">{name}</span>
        <span id={descriptionId} className={cn('block truncate text-[10px]', scope.status === 'none' && 'sr-only', warn ? 'text-warning-label' : 'text-text-secondary')}><span role="status" aria-live="polite">{status}</span>{current && ` · room ${current.grantedRooms}/${current.totalRooms}`}</span>
      </span>
      {!collapsed && <ChevronDown className="size-3 shrink-0 text-text-muted" aria-hidden />}
    </button>
  </DropdownMenuTrigger>;
  return <TooltipProvider><div className="shrink-0 border-b border-border-subtle p-2">
    <DropdownMenu>
      {collapsed ? <Tooltip><TooltipTrigger asChild>{trigger}</TooltipTrigger><TooltipContent side="right">{name} · {status}{current && ` · room ${current.grantedRooms}/${current.totalRooms}`}</TooltipContent></Tooltip> : trigger}
      <DropdownMenuContent align="start" className="w-72 rounded-md border border-border-strong bg-surface-card p-1 shadow-md">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{lang === 'ko' ? '요청 Scope (단일 선택, 서버 재검증)' : 'Requested scope (single, server re-validated)'}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={global.scopeId ?? ''} onValueChange={v => {
          // Re-picking the current Scope from a failed check retries the validation — setGlobal(same) is a
          // no-op and the check would never re-run (#183). Any other pick navigates as before.
          if (v === global.scopeId && scope.status === 'error') retryScope(); else setGlobal({ scopeId: v });
        }}>
          {session.scopes.map(s => <DropdownMenuRadioItem key={s.id} value={s.id} className="text-[13px]">
            <span className="flex-1">{s.label}</span>
            <span className="text-[11px] text-text-muted">room {s.grantedRooms}/{s.totalRooms}</span>
          </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {scope.status === 'error' && <DropdownMenuItem className="text-[13px]" onSelect={() => retryScope()}>
          <RotateCw className="size-3.5" aria-hidden />{t('scopeRetryCheck')}
        </DropdownMenuItem>}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] leading-4 text-text-muted">{lang === 'ko' ? '권한 축은 Site 안의 room_name입니다. Scope를 바꾸면 Site 경계를 넘는 room·설비 조건/선택은 초기화됩니다.' : 'Grants are room_name within a Site. Changing scope clears site-bound room/equipment context.'}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  </div></TooltipProvider>;
}
