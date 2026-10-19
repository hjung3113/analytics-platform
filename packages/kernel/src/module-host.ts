import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { projectContext, type ApiResponse, type ContextKey, type EndpointSpec, type GlobalContext, type ModuleHost, type ModuleScopedId, type ModuleStatus, type ModuleTarget } from '@ap/contracts';
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
  time: ['from', 'to'], roomNames: ['roomNames'], condition: ['condition'], selection: ['selection'],
  lot: ['lotIds'], ppid: ['ppid'], recipe: ['recipeIds'], metric: ['metricId', 'metricVersion'],
};

const abortError = () => new DOMException('The module screen was released or its request context changed.', 'AbortError');

type Pending = { valid: () => boolean; fail: () => void };

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
  const [instance] = useState(() => ({ controller: new AbortController(), released: false, listeners: new Set<() => void>(), pending: new Set<Pending>() }));
  const latest = useRef(platform);
  const portsRef = useRef(ports);

  // Commit-time state for async validity; a changed applied Context or revision fails the calls it invalidates.
  useLayoutEffect(() => {
    latest.current = platform;
    portsRef.current = ports;
    for (const call of [...instance.pending]) if (!call.valid()) call.fail();
  });
  const changeKey = `${platform.revision}|${platform.url}`;
  const seen = useRef(changeKey);
  useEffect(() => {
    if (seen.current === changeKey) return;
    seen.current = changeKey;
    for (const listener of [...instance.listeners]) listener();
  }, [changeKey, instance]);
  // A layout effect, so the host is revoked when the screen is removed (before any replacement's effects can use it) and
  // revived before any passive effect of a descendant runs again in a StrictMode replay.
  useLayoutEffect(() => {
    instance.released = false;
    // React's dev double-effect re-runs setup on the same instance; a real unmount never does.
    if (instance.controller.signal.aborted) instance.controller = new AbortController();
    return () => {
      instance.released = true;
      instance.controller.abort();
      instance.listeners.clear();
      for (const call of [...instance.pending]) call.fail();
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
        if (!instance.released) p.setPage(patch, options);
      },
      href: target => { const link = resolve(target); return link && { href: link.href, allowed: link.allowed }; },
      // Arrival focus is requested when the pathname changes, as PlatformLink does (06 §26, ADR-0032).
      navigate: (target, options) => {
        const link = resolve(target);
        return link !== null && !instance.released && p.navigate(link.href, link.href.split('?')[0] !== p.pathname ? { ...options, focus: 'page' } : options);
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
        if (instance.released) return () => {};
        instance.listeners.add(onChange);
        return () => { instance.listeners.delete(onChange); };
      },
      get signal() { return instance.controller.signal; },
    };
    if (entry.moduleFeatures?.includes('detailSlot') && ports.detail) host.detail = ports.detail;
    if (entry.moduleFeatures?.includes('query')) {
      host.query = <P, T>(spec: EndpointSpec<P, T>, queryParams: P, callerSignal?: AbortSignal): Promise<ApiResponse<T>> => {
        if (instance.released || instance.controller.signal.aborted || callerSignal?.aborted) return Promise.reject(abortError());
        const now = latest.current;
        const request = menuRequest(spec, now);
        if (!request.ready) return Promise.resolve(request.notReady());
        const appliedKey = JSON.stringify(request.projected);
        const startedFor = { revision: now.revision, user: now.user.id };
        return new Promise<ApiResponse<T>>((resolve, reject) => {
          const adapterCall = new AbortController();
          const call: Pending = {
            valid: () => !instance.released && !callerSignal?.aborted && latest.current.revision === startedFor.revision
              && latest.current.user.id === startedFor.user && JSON.stringify(projectContext(spec, latest.current.global)) === appliedKey,
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
    return host;
    // The host is rebuilt when what its synchronous reads depend on changes; `ports` are read through portsRef.
  }, [entry, params, lang, revision, url, session, scope, ports.detail, instance]);
}
