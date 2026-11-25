import { createContext, memo, Suspense, useContext, useId, useInsertionEffect, useMemo, useState, type ComponentType, type MemoExoticComponent, type ReactNode } from 'react';
import { replaceEqualDeep } from '@tanstack/react-query';
import type { GlobalContext, PanelBinding } from '@ap/contracts';
import { messageText } from '../i18n';
import { AppContext, LentPanelOutputsContext, LentPanelPlatformContext } from '../platform/contexts';
import { lentPanelOutputs, lentPanelPlatform } from '../platform/lent-panel-platform';
import { useHostPlatform } from '../platform/platform';
import { useQueryContext } from '../query/condition-preset';
import { LentPanelQueryContext } from '../query/lent-panel-context';
import { shallowEqual, useStable } from '../stable';
import { missingLentPanelInput, type LentPanelVerdict } from './lent-panels';

type Source = PanelBinding['source'];
type Values = Readonly<Record<string, unknown>>;

/** Bound source inputs and the receiver's optional header actions. */
export type LentPanelProps = {
  inputs: { context: Readonly<GlobalContext>; page: Values; display?: Values };
  actions?: ReactNode;
  /** Source output keys the receiving menu binds (#2763). Declare `analysisSelectionOutput` only for these; absent = none. */
  outputs?: readonly string[];
};

export type LentPanelRegistration = {
  component: ComponentType<LentPanelProps>;
  /** Returns the missing or unsupported query input key, or undefined when the source accepts the inputs. */
  accepts?: (inputs: LentPanelProps['inputs']) => string | undefined;
};

const registrations = new Map<Source, {
  component: MemoExoticComponent<ComponentType<LentPanelProps>>;
  accepts?: LentPanelRegistration['accepts'];
}>();

/** Host assembly attaches the source implementation before mounting the platform. */
export function registerLentPanel(source: Source, registration: LentPanelRegistration | ComponentType<LentPanelProps>): void {
  const entry = 'component' in registration ? registration : { component: registration };
  registrations.set(source, { ...entry, component: memo(entry.component) });
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

function copyPageValues(values: Values): { values: Values } | { missing: string } {
  const entries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(values)) {
    try {
      entries.push([key, deepFreeze(structuredClone(value))]);
    } catch {
      // An unreadable query input leaves its page key missing.
      return { missing: key };
    }
  }
  return { values: Object.freeze(Object.fromEntries(entries)) };
}

/** A detached, frozen copy for source code, so a source cannot reach the receiver's state. */
function sourceCopy(inputs: Inputs): Inputs | { missing: string } {
  const page = copyPageValues(inputs.page);
  if ('missing' in page) return page;
  const copied: Inputs = { context: deepFreeze(structuredClone(inputs.context)), page: page.values };
  // Binding resolution already validated, detached and froze the entire display tree.
  if (inputs.display !== undefined) copied.display = inputs.display;
  return Object.freeze(copied);
}

/** Display trees are validated JSON (acyclic, depth 8), so they compare by own keys; a data field named `constructor` is plain data. */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]));
}

function sameInputs(held: Inputs, next: Inputs): boolean {
  const query = { context: held.context, page: held.page };
  return replaceEqualDeep(query, { context: next.context, page: next.page }) === query && jsonEqual(held.display, next.display);
}

function useResolvedLending(source: Source, values: Values | undefined) {
  const receiverPlatform = useHostPlatform();
  const { registry, route, session, page, scope, canOpen } = receiverPlatform;
  const context = useQueryContext();
  const receiver = route?.menu.id;
  if (receiver === undefined) return NOT_REGISTERED;
  const binding = registry.lentPanels(receiver).find(entry => entry.binding.source === source);
  if (binding === undefined) return NOT_REGISTERED;
  if (!canOpen(binding.source.menuId) || !canOpen(receiver)) return binding.denied;

  const resolved = binding.resolve(session, { context, page, values });
  if (!resolved.allowed) return resolved;
  const boundScope = resolved.inputs.context.scopeId;
  if (boundScope !== null && (scope.status !== 'valid' || scope.scopeId !== boundScope || scope.validatedFor !== session)) {
    return missingLentPanelInput('scopeId');
  }
  const registration = registrations.get(source);
  if (registration === undefined) return NOT_REGISTERED;
  const checked = sourceCopy(resolved.inputs);
  if ('missing' in checked) return missingLentPanelInput(checked.missing, binding.source, 'page');
  const missing = registration.accepts?.(checked);
  if (missing !== undefined && !binding.source.display?.some(input => input.key === missing)) return missingLentPanelInput(missing, binding.source);
  const inputs = sourceCopy(resolved.inputs);
  if ('missing' in inputs) return missingLentPanelInput(inputs.missing, binding.source, 'page');
  return { ...resolved, inputs, Component: registration.component, source: binding.source, binding: binding.binding, receiverPlatform };
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

const LentPanelActionsContext = createContext<ReactNode>(null);

function LentPanelActions() {
  const actions = useContext(LentPanelActionsContext);
  return <LentPanelPlatformContext.Provider value={null}>
    <LentPanelOutputsContext.Provider value={null}>
      <LentPanelQueryContext.Provider value={null}>{actions}</LentPanelQueryContext.Provider>
    </LentPanelOutputsContext.Provider>
  </LentPanelPlatformContext.Provider>;
}

const headerActions = <LentPanelActions />;

function LentPanelSource({ resolved, actions }: {
  resolved: Extract<ReturnType<typeof useResolvedLending>, { allowed: true }>;
  actions?: ReactNode;
}) {
  const { Component, receiverPlatform, source, binding: lending } = resolved;
  const inputs = useStable(resolved.inputs, sameInputs);
  const queryInputs = useStable({ context: inputs.context, page: inputs.page }, (held, next) => replaceEqualDeep(held, next) === held);
  const { adapter, route, session, revision, queryPolicy } = receiverPlatform;
  const currentRevision = useContext(AppContext)?.internal.currentRevision;
  const instanceId = useId();
  const queryReady = queryPolicy.ready && !queryPolicy.idle && !queryPolicy.drillGap;
  const binding = useStable({ source, queryInputs, adapter, route, session, revision, queryReady }, shallowEqual);
  const [held, setHeld] = useState(() => ({ binding, generation: 0, controller: new AbortController() }));
  let lifetime = held;
  if (held.binding !== binding) {
    lifetime = { binding, generation: held.generation + 1, controller: new AbortController() };
    setHeld(lifetime);
  }
  const { controller, generation } = lifetime;
  // Revoke before layout effects can use a previous callback. StrictMode's layout-effect replay does not end this binding.
  useInsertionEffect(() => () => controller.abort(), [controller]);
  const platform = useMemo(() => lentPanelPlatform(receiverPlatform, queryInputs), [receiverPlatform, queryInputs]);
  const outputs = useMemo(() => lentPanelOutputs(receiverPlatform, lending.source, lending.outputs), [receiverPlatform, lending]);
  const outputKeys = useMemo(() => outputs ? [...outputs.keys.keys()] : undefined, [outputs]);
  const query = useMemo(() => ({
    source, context: structuredClone(queryInputs.context), instanceId: `${instanceId}:${generation}`, signal: controller.signal,
    current: () => !controller.signal.aborted && adapter.session() === session && currentRevision?.() === revision,
  }), [source, queryInputs, instanceId, generation, controller, adapter, session, currentRevision, revision]);
  return <LentPanelActionsContext.Provider value={actions}>
    <LentPanelQueryContext.Provider value={query}>
      <LentPanelPlatformContext.Provider value={platform}>
        <LentPanelOutputsContext.Provider value={outputs}>
          <Suspense fallback={null}>
            <Component inputs={inputs} actions={actions == null ? actions : headerActions} {...(outputKeys && { outputs: outputKeys })} />
          </Suspense>
        </LentPanelOutputsContext.Provider>
      </LentPanelPlatformContext.Provider>
    </LentPanelQueryContext.Provider>
  </LentPanelActionsContext.Provider>;
}
