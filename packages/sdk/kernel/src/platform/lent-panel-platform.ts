import { buildQuery, type Pair } from '@ap/contracts';
import { createPageNavigation } from '../context/pageNavigation';
import type { LentPanelProps } from '../registry/LentPanel';
import type { LentPanelOutputs } from './contexts';
import type { HostPlatform } from './types';

const noWrite = () => {};
const scopeSelector = { open: noWrite, answer: () => noWrite, available: () => false, subscribe: () => noWrite };

/** The embedded source has bound reads and no ownership of a navigable screen. */
export function lentPanelPlatform(receiver: HostPlatform, inputs: LentPanelProps['inputs']): HostPlatform {
  const global = structuredClone(inputs.context);
  const page: Pair[] = [];
  for (const [key, value] of Object.entries(inputs.page)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string') page.push([key, item]);
    }
  }
  const pathname = '/';
  const url = pathname + buildQuery(global, page);
  return {
    ...receiver,
    global, page, url, pathname, appliedUrl: url,
    route: null, platformScreen: null, extras: [], contractError: null, metricInit: { phase: 'skip' }, currentSpace: null,
    scope: global.scopeId === null
      ? { scopeId: null, status: 'none', validatedFor: null, grantedRooms: [] }
      : { ...receiver.scope, grantedRooms: [...receiver.scope.grantedRooms] },
    pageParam: key => page.find(([name]) => name === key)?.[1] ?? null,
    pageParams: key => page.filter(([name]) => name === key).map(([, value]) => value),
    location: { read: () => url, push: noWrite, replace: noWrite, href: href => receiver.location.href(href), absoluteUrl: href => receiver.location.absoluteUrl(href) },
    pageNavigation: createPageNavigation(url),
    navigate: () => false, setPage: noWrite, setGlobal: noWrite, resetContext: noWrite, switchSpace: noWrite,
    spaceEntry: () => null, spaceResume: () => null,
    detailExpanded: false, setDetailExpanded: noWrite, retryScope: noWrite, scopeSelector,
    // Cross-menu link and return state belong to the action slot's receiving screen.
    resolveLink: () => ({ kind: 'none', href: null, allowed: false, droppedPageKeys: [] }),
    linkTo: () => { throw new Error('Lent panel navigation belongs to the receiving screen'); },
    objectLinks: () => [],
    resolveSelectionLink: () => ({ kind: 'none', href: null, allowed: false, droppedPageKeys: [] }),
    objectSelectionLinks: () => [],
    returnTarget: () => url,
    returnOrigin: () => ({ href: url, menuLabel: { ko: '', en: '' }, trail: [], revertedContext: [], accepted: false, recorded: false, spaceLabel: null }),
    reportError: receiver.reportShellError,
    queryDraft: {
      mode: 'live', draft: { global, page }, dirty: [], missing: [], canApply: false, applying: false,
      setDraftGlobal: noWrite, setDraftPage: noWrite, apply: noWrite, revert: noWrite, reset: noWrite,
    },
    queryHistory: {
      status: 'disabled', entries: [], restore: async () => false, remove: async () => {}, clear: async () => {}, open: noWrite,
    },
  };
}

/**
 * The write side of a lent panel's bound outputs (#2763): the receiver's own screen state with a `setPage` that writes only
 * the receiving keys the binding maps. Every other write (URL, Context, drill, draft) stays as in `lentPanelPlatform`.
 */
export function lentPanelOutputs(receiver: HostPlatform, writerId: string, outputs: Readonly<Record<string, { key: string }>> | undefined): LentPanelOutputs | null {
  const keys = new Map(Object.entries(outputs ?? {}).map(([source, target]) => [source, target.key]));
  if (!keys.size) return null;
  const allowed = new Set(keys.values());
  const setPage: HostPlatform['setPage'] = (patch, options) => {
    if (!Object.keys(patch).every(key => allowed.has(key))) throw new Error('A lent panel writes only the receiving keys its binding maps');
    receiver.setPage(patch, options);
  };
  return { receiver: { ...receiver, setPage }, writerId, keys };
}
