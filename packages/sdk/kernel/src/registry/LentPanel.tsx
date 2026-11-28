import { createContext, memo, Suspense, useContext, useId, useInsertionEffect, useMemo, useState, type ComponentType, type MemoExoticComponent, type ReactNode } from 'react';
import { replaceEqualDeep } from '@tanstack/react-query';
import { heldSelectionProblem, missingRequiredContext, type GlobalContext, type PanelBinding } from '@ap/contracts';
import { useHeldAnalysisSelection } from '../context/analysisSelection';
import { messageText } from '../i18n';
import { jsonEqual } from '../json-equal';
import { AppContext, LentPanelOutputsContext, LentPanelPlatformContext } from '../platform/contexts';
import { lentPanelOutputs, lentPanelPlatform } from '../platform/lent-panel-platform';
import { useHostPlatform } from '../platform/platform';
import { useQueryContext } from '../query/condition-preset';
import { LentPanelQueryContext } from '../query/lent-panel-context';
import { shallowEqual, useStable } from '../stable';
import { missingLentPanelInput, type LentPanelVerdict } from './lent-panels';

type Source = PanelBinding['source'];
type Values = Readonly<Record<string, unknown>>;

export type LentPanelOptions = {
  /** Reads this key and dimension from HeldAnalysisSelections for the bound Context time input. */
  holdTime?: { readonly key: string; readonly dimension: string };
  /** Withholds the bound output keys from this instance and disables its writes and availability reports to the receiving page. */
  disablePageOutputs?: boolean;
};

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

function sameInputs(held: Inputs, next: Inputs): boolean {
  const query = { context: held.context, page: held.page };
  return replaceEqualDeep(query, { context: next.context, page: next.page }) === query && jsonEqual(held.display, next.display);
}

function rejectedHeld(key: string): Extract<LentPanelVerdict, { allowed: false }> {
  return { allowed: false, reason: { kind: 'rejected-held', key, text: messageText('lentPanelRejectedHeldTime') } };
}

function useResolvedLending(source: Source, values: Values | undefined, { holdTime }: LentPanelOptions = {}) {
  const receiverPlatform = useHostPlatform();
  const { registry, route, session, page, scope, canOpen } = receiverPlatform;
  const context = useQueryContext();
  const held = useHeldAnalysisSelection(holdTime?.key);
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
  let boundInputs = resolved.inputs;
  if (holdTime && held) {
    const { selection } = held;
    if (!binding.binding.context?.time || held.dimension !== holdTime.dimension || selection?.shape !== 'range' || heldSelectionProblem(selection)) {
      return rejectedHeld(holdTime.key);
    }
    const heldContext = { ...boundInputs.context, from: selection.from, to: selection.to };
    if (missingRequiredContext(['time'], heldContext).length) return rejectedHeld(holdTime.key);
    boundInputs = { ...boundInputs, context: heldContext };
  }
  const checked = sourceCopy(boundInputs);
  if ('missing' in checked) return missingLentPanelInput(checked.missing, binding.source, 'page');
  const missing = registration.accepts?.(checked);
  if (holdTime && held && missing === 'time') return rejectedHeld(holdTime.key);
  if (missing !== undefined && !binding.source.display?.some(input => input.key === missing)) return missingLentPanelInput(missing, binding.source);
  const inputs = sourceCopy(boundInputs);
  if ('missing' in inputs) return missingLentPanelInput(inputs.missing, binding.source, 'page');
  return { ...resolved, inputs, Component: registration.component, source: binding.source, binding: binding.binding, receiverPlatform };
}

/** The receiving menu reads this verdict to place a reason next to the selection. */
export function useLentPanel(source: Source, values?: Values, options?: LentPanelOptions): LentPanelVerdict {
  const resolved = useResolvedLending(source, values, options);
  return resolved.allowed ? { allowed: true, reason: null } : resolved;
}

/** A disallowed source never mounts, so it cannot start a query or restore a previous answer. */
export function LentPanel({ source, values, actions, holdTime, disablePageOutputs }: LentPanelOptions & { source: Source; values?: Values; actions?: ReactNode }) {
  const resolved = useResolvedLending(source, values, { holdTime });
  if (!resolved.allowed) return null;
  return <LentPanelSource key={source} resolved={resolved} actions={actions} disablePageOutputs={disablePageOutputs} />;
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

function LentPanelSource({ resolved, actions, disablePageOutputs }: {
  resolved: Extract<ReturnType<typeof useResolvedLending>, { allowed: true }>;
  actions?: ReactNode;
  disablePageOutputs?: boolean;
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
  const query = useMemo(() => ({
    source, context: structuredClone(queryInputs.context), instanceId: `${instanceId}:${generation}`, signal: controller.signal,
    current: () => !controller.signal.aborted && adapter.session() === session && currentRevision?.() === revision,
  }), [source, queryInputs, instanceId, generation, controller, adapter, session, currentRevision, revision]);
  // Writes end with the binding, with any input change (display too, without cancelling queries) and, at call time, with a
  // session or revision change, so a callback kept from an earlier render cannot write (#2763 R C2, R2 C2).
  const outputBinding = useStable({ controller, inputs, disablePageOutputs }, shallowEqual);
  const { output: outputLifetime } = useMemo(() => ({ binding: outputBinding, output: new AbortController() }), [outputBinding]);
  useInsertionEffect(() => () => outputLifetime.abort(), [outputLifetime]);
  const outputs = useMemo(() => disablePageOutputs ? null : lentPanelOutputs(receiverPlatform, lending.source, lending.outputs, outputLifetime.signal, query.current),
    [receiverPlatform, lending, outputLifetime, query, disablePageOutputs]);
  const outputKeys = useMemo(() => outputs ? [...outputs.keys.keys()] : undefined, [outputs]);
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
