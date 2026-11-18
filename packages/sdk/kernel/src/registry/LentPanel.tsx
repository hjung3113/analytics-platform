import { Suspense, useContext, useId, useInsertionEffect, useState, type ComponentType, type ReactNode } from 'react';
import { replaceEqualDeep } from '@tanstack/react-query';
import type { GlobalContext, PanelBinding } from '@ap/contracts';
import { messageText } from '../i18n';
import { AppContext, LentPanelPlatformContext } from '../platform/contexts';
import { lentPanelPlatform } from '../platform/lent-panel-platform';
import { useHostPlatform } from '../platform/platform';
import { useQueryContext } from '../query/condition-preset';
import { LentPanelQueryContext } from '../query/lent-panel-context';
import { shallowEqual, useStable } from '../stable';
import { LENT_PANEL_PERMISSION_DENIED, missingLentPanelInput, type LentPanelVerdict } from './lent-panels';

type Source = PanelBinding['source'];
type Values = Readonly<Record<string, unknown>>;

/** Bound source inputs and the receiver's optional header actions. */
export type LentPanelProps = {
  inputs: { context: Readonly<GlobalContext>; page: Values };
  actions?: ReactNode;
};

export type LentPanelRegistration = {
  component: ComponentType<LentPanelProps>;
  /** Returns the missing or unsupported input key, or undefined when the source accepts the inputs. */
  accepts?: (inputs: LentPanelProps['inputs']) => string | undefined;
};

const registrations = new Map<Source, LentPanelRegistration>();

/** Host assembly attaches the source implementation before mounting the platform. */
export function registerLentPanel(source: Source, registration: LentPanelRegistration | ComponentType<LentPanelProps>): void {
  registrations.set(source, 'component' in registration ? registration : { component: registration });
}

const NOT_REGISTERED = {
  allowed: false,
  reason: { kind: 'not-registered', text: messageText('lentPanelUnavailable') },
} as const satisfies LentPanelVerdict;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

type Inputs = LentPanelProps['inputs'];

/**
 * A detached, frozen copy for source code, so a source cannot reach the receiver's state. A page value that cannot be
 * copied or frozen (a symbol, a function, a typed array) is reported as that key's missing input instead of throwing.
 */
function sourceCopy(inputs: Inputs): Inputs | { missing: string } {
  const page: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs.page)) {
    try {
      page[key] = deepFreeze(structuredClone(value));
    } catch {
      return { missing: key };
    }
  }
  return Object.freeze({ context: deepFreeze(structuredClone(inputs.context)), page: Object.freeze(page) });
}

function useResolvedLending(source: Source, values: Values | undefined) {
  const receiverPlatform = useHostPlatform();
  const { registry, route, session, page, scope, canOpen } = receiverPlatform;
  const context = useQueryContext();
  const receiver = route?.menu.id;
  if (receiver === undefined) return NOT_REGISTERED;
  const binding = registry.lentPanels(receiver).find(entry => entry.binding.source === source);
  if (binding === undefined) return NOT_REGISTERED;
  if (!canOpen(binding.source.menuId) || !canOpen(receiver)) return LENT_PANEL_PERMISSION_DENIED;

  const resolved = binding.resolve(session, { context, page, values });
  if (!resolved.allowed) return resolved;
  const boundScope = resolved.inputs.context.scopeId;
  if (boundScope !== null && (scope.status !== 'valid' || scope.scopeId !== boundScope || scope.validatedFor !== session)) {
    return missingLentPanelInput('scopeId');
  }
  const registration = registrations.get(source);
  if (registration === undefined) return NOT_REGISTERED;
  const requestContext = structuredClone(resolved.inputs.context);
  const checked = sourceCopy(resolved.inputs);
  if ('missing' in checked) return missingLentPanelInput(checked.missing);
  const missing = registration.accepts?.(checked);
  if (missing !== undefined) return missingLentPanelInput(missing);
  const inputs = sourceCopy(resolved.inputs);
  if ('missing' in inputs) return missingLentPanelInput(inputs.missing);
  return { ...resolved, inputs, requestContext, Component: registration.component, source: binding.source, receiverPlatform };
}

/** The receiving menu reads this verdict to place a reason next to the selection. */
export function useLentPanel(source: Source, values?: Values): LentPanelVerdict {
  const resolved = useResolvedLending(source, values);
  return resolved.allowed ? { allowed: true, reason: null } : resolved;
}

/** A disallowed source never mounts, so it cannot start a query or restore a previous answer. */
export function LentPanel({ source, values, actions }: { source: Source; values?: Values; actions?: ReactNode }) {
  const resolved = useResolvedLending(source, values);
  if (!resolved.allowed) return null;
  return <LentPanelSource key={source} resolved={resolved} actions={actions} />;
}

function LentPanelSource({ resolved, actions }: {
  resolved: Extract<ReturnType<typeof useResolvedLending>, { allowed: true }>;
  actions?: ReactNode;
}) {
  const { Component, receiverPlatform, requestContext, source } = resolved;
  const inputs = useStable(resolved.inputs, (held, next) => replaceEqualDeep(held, next) === held);
  const { adapter, route, session, revision, queryPolicy } = receiverPlatform;
  const currentRevision = useContext(AppContext)?.internal.currentRevision;
  const instanceId = useId();
  const queryReady = queryPolicy.ready && !queryPolicy.idle && !queryPolicy.drillGap;
  const binding = useStable({ source, inputs, adapter, route, session, revision, queryReady }, shallowEqual);
  const [held, setHeld] = useState(() => ({ binding, generation: 0, controller: new AbortController() }));
  let lifetime = held;
  if (held.binding !== binding) {
    lifetime = { binding, generation: held.generation + 1, controller: new AbortController() };
    setHeld(lifetime);
  }
  const { controller, generation } = lifetime;
  // Revoke before layout effects can use a previous callback. StrictMode's layout-effect replay does not end this binding.
  useInsertionEffect(() => () => controller.abort(), [controller]);
  const query = {
    source, context: requestContext, instanceId: `${instanceId}:${generation}`, signal: controller.signal,
    current: () => !controller.signal.aborted && adapter.session() === session && currentRevision?.() === revision,
  };
  const headerActions = actions == null ? actions : (
    <LentPanelPlatformContext.Provider value={null}>
      <LentPanelQueryContext.Provider value={null}>{actions}</LentPanelQueryContext.Provider>
    </LentPanelPlatformContext.Provider>
  );
  return <LentPanelQueryContext.Provider value={query}>
    <LentPanelPlatformContext.Provider value={lentPanelPlatform(receiverPlatform, inputs)}>
      <Suspense fallback={null}>
        <Component inputs={inputs} actions={headerActions} />
      </Suspense>
    </LentPanelPlatformContext.Provider>
  </LentPanelQueryContext.Provider>;
}
