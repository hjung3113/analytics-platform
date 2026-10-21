import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { projectContext, type ActionResult, type ActionSpec, type ApiResponse, type ContextKey, type EndpointSpec, type GlobalContext, type ModuleHost, type ModuleScopedId, type ModuleStatus, type ModuleTarget } from '@ap/contracts';
import { abortError, actionRequest, launchWrite, type PendingWrite, type WriteFlight } from './action';
import { useI18n } from './i18n';
import { usePlatform } from './platform';
import { menuRequest } from './query';
import type { ModuleMenuEntry } from './registry';

/** What only the shell can supply to a screen's host: status ownership, the arrival-focus target and the detail slot. */
export type ModuleShellPorts = {
  status: (next: ModuleStatus) => void;
  focusTarget: (el: unknown) => void;
  /** Passed through only when the module declared `detailSlot` and this host provides it. */
  detail?: ModuleHost['detail'];
};

/** Global fields each Context key reads, for `host.context()` (v1 semantics, hosting design §2.2 "전역 Context"). */
const CONTEXT_FIELDS: Record<ContextKey, readonly (keyof GlobalContext)[]> = {
  time: ['from', 'to'], roomNames: ['roomNames'], line: ['lineNames'], prcGroup: ['prcGroups', 'membershipBasis'], condition: ['condition', 'membershipBasis'], selection: ['selection'],
  lot: ['lotIds'], ppid: ['ppid'], recipe: ['recipeIds'], metric: ['metricId', 'metricVersion'],
};

type Pending = { valid: () => boolean; fail: () => void };
/** A call a screen made between the owner's layout cleanup and its re-setup: started on re-setup, rejected if the screen is really gone. */
type Deferred = { start: () => void; fail: () => void };
type Lifetime = 'active' | 'suspended' | 'released';

/**
 * The ModuleHost one mounted, ready screen instance receives (ADR-0053, hosting design §2.2/§2.5). The caller owns
 * the instance: it mounts this hook only while the screen is ready, so unmounting is the release — the `signal`
 * aborts, pending queries reject with AbortError and subscriptions are dropped. Reads come from the render that
 * built the host (the host is a snapshot: a new object when the URL, session or language changes, so a screen depends
 * on the values it reads, not on the host's identity); async validity checks read the latest committed platform
 * state. No UI here: status, arrival focus
 * and the detail slot come from the shell through `ports`.
 */
export function useModuleHost(entry: ModuleMenuEntry, params: Readonly<Record<string, string>>, ports: ModuleShellPorts): ModuleHost {
  const platform = usePlatform();
  const { lang } = useI18n();
  const [instance] = useState(() => ({
    controller: new AbortController(), state: 'active' as Lifetime, listeners: new Set<() => void>(), pending: new Set<Pending>(), deferred: new Set<Deferred>(),
    writes: new Map<string, WriteFlight['slot']>(), writePending: new Set<PendingWrite>(),
  }));
  const latest = useRef(platform);
  const portsRef = useRef(ports);

  // Commit-time state for async validity; a changed applied Context or revision fails the calls it invalidates.
  useLayoutEffect(() => {
    latest.current = platform;
    portsRef.current = ports;
    for (const call of [...instance.pending, ...instance.writePending]) if (!call.valid()) call.fail();
  });
  // A write elsewhere refreshes queries the module cannot see: its listeners hear every epoch bump.
  const epochTotal = useSyncExternalStore(platform.refreshEpochs.subscribe, platform.refreshEpochs.total);
  const changeKey = `${platform.revision}|${platform.url}|${epochTotal}`;
  const seen = useRef(changeKey);
  useEffect(() => {
    if (seen.current === changeKey) return;
    seen.current = changeKey;
    for (const listener of [...instance.listeners]) listener();
  }, [changeKey, instance]);
  // A layout effect, so the screen's removal is seen in the commit that removes it, before a replacement's effects run.
  // React's dev StrictMode replay runs the owner's cleanup, then the descendants' layout setup, then the owner's setup,
  // so between cleanup and setup the instance is only suspended: the signal is aborted and pending
  // calls fail at once, but a call made now waits (no adapter work) for the setup that follows a replay. A removal is
  // final when no setup followed by the end of the commit's synchronous work.
  useLayoutEffect(() => {
    instance.state = 'active';
    if (instance.controller.signal.aborted) instance.controller = new AbortController();
    for (const call of [...instance.deferred]) { instance.deferred.delete(call); call.start(); }
    return () => {
      instance.state = 'suspended';
      instance.controller.abort();
      instance.listeners.clear();
      for (const call of [...instance.pending, ...instance.writePending]) call.fail();
      queueMicrotask(() => {
        if (instance.state !== 'suspended') return;
        instance.state = 'released';
        instance.listeners.clear();
        for (const call of [...instance.deferred]) { instance.deferred.delete(call); call.fail(); }
      });
    };
  }, [instance]);

  const { revision, url, session, scope } = platform;
  return useMemo((): ModuleHost => {
    const p = platform;
    const declared = (key: string) => entry.pageKeys.includes(key);
    // Only registered menus resolve, through the platform's own link builder: a module never assembles a URL.
    const resolve = (target: ModuleTarget) => {
      try {
        let id: string;
        if ('screen' in target) {
          // A prefixed id is not proof of ownership (a nested module id or a platform id can look the same): the entry must be this module's.
          id = `${entry.module}:${target.screen}`;
          const candidate = p.registry.menuById(id);
          if (candidate.moduleScreen === undefined || candidate.module !== entry.module) return null;
        } else id = target.menuId;
        return p.resolveLink(id, { params: target.params, page: target.page, returnTo: target.returnTo });
      } catch { return null; }
    };
    const host: ModuleHost = {
      contract: 1,
      session: () => ({ user: { id: p.user.id, name: p.user.name }, generation: p.revision }),
      can: permission => p.can(permission as ModuleScopedId),
      params: () => params,
      page: key => declared(key) ? p.pageParam(key) : null,
      setPage(patch, options) {
        const undeclared = Object.keys(patch).find(key => !declared(key));
        if (undeclared !== undefined) throw new RangeError(`Module "${entry.module}" screen "${entry.id}" does not declare page key "${undeclared}"`);
        if (instance.state === 'active') p.setPage(patch, options);
      },
      href: target => { const link = resolve(target); return link && { href: link.href, allowed: link.allowed }; },
      // Arrival focus is requested when the pathname changes, as PlatformLink does (06 §26, ADR-0032).
      navigate: (target, options) => {
        const link = resolve(target);
        return link !== null && instance.state === 'active' && p.navigate(link.href, link.href.split('?')[0] !== p.pathname ? { ...options, focus: 'page' } : options);
      },
      returnTarget: () => p.returnTarget(),
      context() {
        const values: Partial<GlobalContext> = {};
        const unsupported: ContextKey[] = [];
        for (const key of Object.keys(CONTEXT_FIELDS) as ContextKey[]) {
          if (entry.context[key] === 'unsupported') { unsupported.push(key); continue; }
          for (const field of CONTEXT_FIELDS[key]) (values as Record<string, unknown>)[field] = p.global[field];
        }
        if (entry.requiresScope) values.scopeId = p.global.scopeId;
        return { values, unsupported };
      },
      config: key => entry.moduleConfig?.[key] ?? null,
      lang: () => lang,
      notify: (text, tone) => p.toast(text, tone === 'info' ? undefined : tone),
      status: next => portsRef.current.status(next),
      reportError: error => p.reportError(error),
      focusTarget: el => portsRef.current.focusTarget(el),
      subscribe(onChange) {
        if (instance.state === 'released') return () => {};
        instance.listeners.add(onChange);
        return () => { instance.listeners.delete(onChange); };
      },
      get signal() { return instance.controller.signal; },
    };
    if (entry.moduleFeatures?.includes('detailSlot') && ports.detail) host.detail = ports.detail;
    if (entry.moduleFeatures?.includes('query')) {
      host.query = <P, T>(spec: EndpointSpec<P, T>, queryParams: P, callerSignal?: AbortSignal): Promise<ApiResponse<T>> => {
        const own = instance.controller.signal;
        // While suspended the host's own signal is already aborted; passing it back to `query` is not a caller abort.
        const suspended = instance.state === 'suspended';
        if (instance.state === 'released' || (callerSignal?.aborted && !(suspended && callerSignal === own))) return Promise.reject(abortError());
        if (suspended) {
          return new Promise<ApiResponse<T>>((resolve, reject) => {
            const call: Deferred = { start: () => host.query!(spec, queryParams, callerSignal === own ? undefined : callerSignal).then(resolve, reject), fail: () => reject(abortError()) };
            instance.deferred.add(call);
          });
        }
        if (own.aborted) return Promise.reject(abortError());
        const now = latest.current;
        const request = menuRequest(spec, now);
        if (!request.ready) return Promise.resolve(request.notReady());
        const appliedKey = JSON.stringify(request.projected);
        const startedFor = { revision: now.revision, user: now.user.id };
        return new Promise<ApiResponse<T>>((resolve, reject) => {
          const adapterCall = new AbortController();
          const call: Pending = {
            valid: () => instance.state === 'active' && !callerSignal?.aborted && latest.current.revision === startedFor.revision
              && latest.current.user.id === startedFor.user && latest.current.queryPolicy.ready && !latest.current.queryPolicy.idle && JSON.stringify(projectContext(spec, latest.current.global)) === appliedKey,
            fail: () => { settle(); adapterCall.abort(); reject(abortError()); },
          };
          const settle = () => { instance.pending.delete(call); callerSignal?.removeEventListener('abort', call.fail); };
          instance.pending.add(call);
          callerSignal?.addEventListener('abort', call.fail);
          request.send(queryParams, adapterCall.signal).then(
            response => { if (!call.valid()) return call.fail(); settle(); resolve(response); },
            error => { if (!call.valid()) return call.fail(); settle(); reject(error); },
          );
        });
      };
    }
    if (entry.moduleFeatures?.includes('write')) {
      host.act = <I, T>(spec: ActionSpec<I, T>, input: I, options?: { expectedVersion?: string }): Promise<ActionResult<T>> => {
        const slot = instance.writes.get(spec.id) ?? { promise: null };
        instance.writes.set(spec.id, slot);
        if (slot.promise) return slot.promise;
        if (instance.state === 'released') return Promise.reject(abortError());
        const now = latest.current;
        const request = actionRequest(spec, input, options?.expectedVersion, now);
        if (!request.ready) return Promise.resolve(request.notReady());
        const origin = { revision: now.revision, user: now.user.id };
        const sameGeneration = () => latest.current.revision === origin.revision && latest.current.user.id === origin.user;
        const flight: WriteFlight = {
          slot, pending: instance.writePending,
          valid: () => instance.state === 'active' && sameGeneration(),
          // Suspended is not expired: a StrictMode re-setup may still follow.
          expired: () => instance.state === 'released' || !sameGeneration(),
          // Like `query`: a call made while only suspended waits for the re-setup of a StrictMode replay, and fails if the screen is really gone.
          gate: start => instance.state === 'released' ? Promise.reject(abortError())
            : instance.state === 'suspended'
              ? new Promise((resolve, reject) => { instance.deferred.add({ start: () => start().then(resolve, reject), fail: () => reject(abortError()) }); })
              : start(),
        };
        return launchWrite(flight, request.send);
      };
    }
    return host;
    // The host is rebuilt when what its synchronous reads depend on changes; `ports` are read through portsRef.
  }, [entry, params, lang, revision, url, session, scope, ports.detail, instance]);
}
