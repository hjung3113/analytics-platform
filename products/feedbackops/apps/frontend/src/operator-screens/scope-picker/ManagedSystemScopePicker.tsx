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
  if (collapsed) return null;
  const scopeControlEnabled = !disabled;
  const selectedSystem = managedSystems.find((system) => system.id === value);
  const grantedSystems = managedSystems.filter((system) => system.granted);
  const isUnion = !workspaceWideScope && value === undefined;
  const scopeName = scopeControlEnabled
    ? (selectedSystem?.name ?? SCOPE_SELECTOR_COPY.allLabel)
    : SCOPE_SELECTOR_COPY.workspaceAll;
  const scopeQualifier = scopeControlEnabled
    ? selectedSystem && !selectedSystem.granted
      ? SCOPE_SELECTOR_COPY.outOfScope
      : isUnion
        ? SCOPE_SELECTOR_COPY.unionAccessibleQualifier
        : null
    : null;
  const scopeAccessibleName = scopeQualifier ? `${scopeName}, ${scopeQualifier}` : scopeName;

  const select = (managedSystemId: string | undefined) => {
    onChange(managedSystemId);
    setOpen(false);
  };

  return (
    <div className="relative border-b border-border-subtle p-2">
      {label !== undefined && (
        <div className="px-1 pb-1 text-caption text-text-muted" data-testid="scope-label">
          {label}
        </div>
      )}
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-border-subtle px-2 py-2 text-left text-sm hover:bg-surface-row-hover',
          !scopeControlEnabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
        )}
        onClick={() => scopeControlEnabled && setOpen((current) => !current)}
        disabled={!scopeControlEnabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={scopeAccessibleName}
        title={
          scopeControlEnabled ? scopeName : '이 화면은 Managed System 범위를 지원하지 않습니다'
        }
        data-testid="scope-selector"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-primary/15 text-xs font-semibold text-accent-primary">
          {selectedSystem ? selectedSystem.name.slice(0, 1) : '∗'}
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
        // biome-ignore lint/a11y/useFocusableInteractive: the focusable options inside are the keyboard targets, as before the move.
        <div
          className="absolute left-2 right-2 top-full z-50 mt-1 rounded-md border border-border-subtle bg-surface-popover p-1 shadow-lg"
          // biome-ignore lint/a11y/useSemanticElements: moved verbatim from the standalone sidebar; the options are buttons, not <option>s.
          role="listbox"
          aria-label="Managed System 범위"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-row-hover"
            onClick={() => select(undefined)}
            data-testid="scope-option-all"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-primary/15 text-xs text-accent-primary">
              ∗
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{SCOPE_SELECTOR_COPY.allLabel}</span>
              <span className="block text-caption text-text-muted">
                {workspaceWideScope
                  ? SCOPE_SELECTOR_COPY.workspaceAll
                  : `${SCOPE_SELECTOR_COPY.assignedCountPrefix} ${grantedSystems.length} / ${managedSystems.length}`}
              </span>
            </span>
          </button>
          {managedSystems.map((system) => (
            <button
              key={system.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-row-hover',
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
            </button>
          ))}
          {/* #282: sits outside the option buttons on purpose — inside one,
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
