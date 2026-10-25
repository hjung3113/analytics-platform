// The `목록 범위` Managed System picker (ADR-0081 decision 4). Presentational: the value lives in the caller, the picker
// only displays what the server returned (`granted`, `workspaceWideScope`) and never decides access. Lives outside
// `lib/layout/` so the platform bridge can reach it (`./operator-screens/scope-picker`); the standalone sidebar renders it too.

import { SCOPE_SELECTOR_COPY } from '@/lib/copy/managed-system-scope';
import { cn } from '@fops/ui';
import { ChevronDown, Shield } from 'lucide-react';
import * as React from 'react';

export interface ManagedSystemScopeOption {
  id: string;
  name: string;
  granted: boolean;
}

export interface ManagedSystemScopePickerProps {
  managedSystems: ManagedSystemScopeOption[];
  /** Selected Managed System id; `undefined` is `전체`. Never stored here. */
  value?: string;
  onChange: (managedSystemId: string | undefined) => void;
  /** True on a screen whose data is not scoped by Managed System. */
  disabled?: boolean;
  isAdmin: boolean;
  /** Whether the actor's current scope is workspace-wide, rather than a granted union. */
  workspaceWideScope: boolean;
  collapsed?: boolean;
  /** Visible label above the trigger; none by default (the standalone sidebar). */
  label?: string;
}

export function ManagedSystemScopePicker({
  managedSystems,
  value,
  onChange,
  disabled = false,
  isAdmin,
  workspaceWideScope,
  collapsed = false,
  label,
}: ManagedSystemScopePickerProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const allNameId = React.useId();
  const allHelpId = React.useId();

  // Roving real focus (not aria-activedescendant): opening moves focus to the current value's option.
  React.useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const target =
      list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') ??
      list?.querySelector<HTMLElement>('[role="option"]');
    target?.focus();
  }, [open]);

  if (collapsed) return null;
  const scopeControlEnabled = !disabled;
  const selectedSystem = managedSystems.find((system) => system.id === value);
  // An empty list (loading, error, no systems) keeps `전체`; only a loaded list can prove a uuid unknown.
  const isUnknown = value !== undefined && managedSystems.length > 0 && !selectedSystem;
  const grantedSystems = managedSystems.filter((system) => system.granted);
  const isUnion = !workspaceWideScope && value === undefined;
  const scopeName = scopeControlEnabled
    ? (selectedSystem?.name ??
      (isUnknown ? SCOPE_SELECTOR_COPY.unknownLabel : SCOPE_SELECTOR_COPY.allLabel))
    : SCOPE_SELECTOR_COPY.workspaceAll;
  const scopeQualifier = scopeControlEnabled
    ? selectedSystem && !selectedSystem.granted
      ? SCOPE_SELECTOR_COPY.outOfScope
      : isUnion
        ? SCOPE_SELECTOR_COPY.unionAccessibleQualifier
        : null
    : null;
  const scopeAccessibleName = [label, scopeName, scopeQualifier].filter(Boolean).join(', ');

  const select = (managedSystemId: string | undefined) => {
    onChange(managedSystemId);
    triggerRef.current?.focus();
    setOpen(false);
  };

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      triggerRef.current?.focus();
      setOpen(false);
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
    const current = options.indexOf(event.target as HTMLElement);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      options[current]?.click();
      return;
    }
    const next =
      event.key === 'ArrowDown'
        ? Math.min(current + 1, options.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(current - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    options[next]?.focus();
  };

  // Tab, Shift+Tab or a click elsewhere: close without pulling focus back.
  const onRootBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative border-b border-border-subtle p-2"
      onKeyDown={onRootKeyDown}
      onBlur={onRootBlur}
    >
      {label !== undefined && (
        <div className="px-1 pb-1 text-caption text-text-muted" data-testid="scope-label">
          {label}
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-border-subtle px-2 py-2 text-left text-sm hover:bg-surface-row-hover',
          !scopeControlEnabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
        )}
        onClick={() => scopeControlEnabled && setOpen((current) => !current)}
        disabled={!scopeControlEnabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={scopeAccessibleName}
        title={
          scopeControlEnabled ? scopeName : '이 화면은 Managed System 범위를 지원하지 않습니다'
        }
        data-testid="scope-selector"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-primary/15 text-xs font-semibold text-accent-primary">
          {selectedSystem ? selectedSystem.name.slice(0, 1) : isUnknown ? '?' : '∗'}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1 font-medium">
            <span className="min-w-0 flex-1 truncate" data-testid="scope-name" title={scopeName}>
              {scopeName}
            </span>
            {scopeControlEnabled && selectedSystem && !selectedSystem.granted && (
              <ScopeBadge
                testId="scope-out-of-scope-badge"
                label={SCOPE_SELECTOR_COPY.outOfScope}
                urgent
              />
            )}
          </span>
          {scopeControlEnabled && isUnion && grantedSystems.length > 0 && (
            <span className="block truncate text-caption text-text-muted">
              {SCOPE_SELECTOR_COPY.assignedPrefix}{' '}
              {grantedSystems.map((system) => system.name).join(' · ')}
            </span>
          )}
        </span>
        {scopeControlEnabled && <ChevronDown className="h-3 w-3 shrink-0 text-text-muted" />}
      </button>
      {scopeControlEnabled && open && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-md border border-border-subtle bg-surface-popover p-1 shadow-lg">
          {/* biome-ignore lint/a11y/useFocusableInteractive: the options inside take focus (roving), not the listbox. */}
          <div
            ref={listRef}
            id={listId}
            // biome-ignore lint/a11y/useSemanticElements: a custom listbox with helper text per option; a native <select> cannot render it.
            role="listbox"
            aria-label="Managed System 범위"
            onKeyDown={onListKeyDown}
          >
            {/* biome-ignore lint/a11y/useSemanticElements: see the listbox above. */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: Enter/Space are handled by the listbox's onKeyDown. */}
            <div
              role="option"
              tabIndex={-1}
              aria-selected={value === undefined || (!selectedSystem && !isUnknown)}
              aria-labelledby={allNameId}
              aria-describedby={allHelpId}
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-row-hover"
              onClick={() => select(undefined)}
              data-testid="scope-option-all"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-primary/15 text-xs text-accent-primary">
                ∗
              </span>
              <span className="min-w-0 flex-1">
                <span id={allNameId} className="block font-medium">
                  {SCOPE_SELECTOR_COPY.allLabel}
                </span>
                <span id={allHelpId} className="block text-caption text-text-muted">
                  {workspaceWideScope
                    ? SCOPE_SELECTOR_COPY.workspaceAll
                    : `${SCOPE_SELECTOR_COPY.assignedCountPrefix} ${grantedSystems.length} / ${managedSystems.length}`}
                </span>
              </span>
            </div>
            {managedSystems.map((system) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: Enter/Space are handled by the listbox's onKeyDown.
              <div
                key={system.id}
                // biome-ignore lint/a11y/useSemanticElements: see the listbox above.
                role="option"
                tabIndex={-1}
                aria-selected={system.id === value}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-row-hover',
                  !system.granted && 'opacity-55',
                )}
                onClick={() => select(system.id)}
                data-testid={`scope-option-${system.id}`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-row-selected text-xs font-semibold">
                  {system.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate">{system.name}</span>
                {!system.granted && (
                  <Shield className="h-3 w-3 text-text-muted" aria-label="범위 밖" />
                )}
              </div>
            ))}
          </div>
          {/* #282: sits outside the options on purpose — inside one,
              the sentence would become part of that option's accessible name. */}
          {!isAdmin && (
            <p
              className="px-2 py-1.5 text-caption text-text-muted"
              data-testid="scope-name-visibility-note"
            >
              이름은 워크스페이스 전체에 공개되며, 접근하려면 권한을 요청하세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ScopeBadge({
  testId,
  label,
  urgent = false,
}: { testId: string; label: string; urgent?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent-primary/10 px-1 py-0.5 text-micro font-medium text-accent-primary',
        urgent && 'bg-accent-danger/15 text-accent-danger',
      )}
      data-testid={testId}
    >
      {label}
    </span>
  );
}
