import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { clientCorrelationId, type ActionResponse, type ApiResponse, type MenuView, type SavedView, type SavedViewSupport } from '@ap/contracts';
import { createPageNavigation } from '../context/pageNavigation';
import { AppContext, ScreenContext, type ScreenSource } from '../platform/contexts';
import { createNavigationGuard } from '../platform/navigationGuard';
import { createSessionDraftStore } from '../platform/sessionDraft';
import type { HostPlatform } from '../platform/types';
import { useScreenState } from '../platform/useScreenState';
import { PreferenceContext } from '../platform/preferenceContext';
import { restoreSavedView, type RestoreFailure } from './restore';
import { createViewSlotStore } from './table-slots';
import { createSupportRegistry } from './useSavedViewSupport';
import { PANELS_SLOT } from './useSavedViewPanels';
import { savedPanelsSlot } from './useSavedViews';

export function prepareSavedViewPreview(view: Extract<SavedView, { kind: 'menu-view' }>, support: SavedViewSupport, host: HostPlatform): { href: string } | { reason: RestoreFailure | 'unavailable' } {
  const anchor = host.adapter.defaultRangeTo();
  if (host.contractError || (host.route?.menu.requiresScope && host.scope.status !== 'valid') || (view.context.relativePeriod && anchor === null)) return { reason: 'unavailable' };
  const result = restoreSavedView({ view, support, current: host, extras: host.extras, pathname: host.pathname, anchor, source: 'selected' });
  if (!result.ok) return result;
  return result.applied ? { href: result.href } : { reason: 'unavailable' };
}

const refuse = () => false;
const ignore = () => {};
const refuseAction = async (): Promise<ActionResponse<never>> => ({
  outcome: 'forbidden', data: null, version: null, fieldErrors: [], replayed: false, correlationId: clientCorrelationId(),
});
const refuseWrite = async (): Promise<ApiResponse<never>> => ({
  outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(),
});
const stop = (event: SyntheticEvent) => event.stopPropagation();
const block = (event: SyntheticEvent) => { event.preventDefault(); stop(event); };

type PreviewTabHandler = (target: Element, key?: string) => boolean;
const PreviewTabs = createContext<WeakMap<Element, PreviewTabHandler> | null>(null);

/** Shared dock integration. Review dispatches display gestures without forwarding the original event. */
export function useReadOnlyPreviewTabs() { return useContext(PreviewTabs); }

function dispatchTabGesture(tabs: WeakMap<Element, PreviewTabHandler>, event: SyntheticEvent, key?: string): boolean {
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return false;
  for (let node: Element | null = target; node && node !== event.currentTarget; node = node.parentElement) {
    const handler = tabs.get(node);
    if (handler) return handler(target, key);
  }
  return false;
}

type SavedViewPreviewProps = {
  view: MenuView;
  href: string;
  /** Keep screen content readable and allow local dock tab selection while blocking edits, navigation and platform writes. */
  readOnly?: boolean;
  children: ReactNode;
};

/** Virtual address for the actual menu. Drafts and restored slots belong to this copy alone. */
export function SavedViewPreview(props: SavedViewPreviewProps) {
  const { view, href } = props;
  return <PreviewScreen key={JSON.stringify([view.id, view.version, href])} {...props} />;
}

function PreviewScreen({ view, href, readOnly = false, children }: SavedViewPreviewProps) {
  const app = useContext(AppContext);
  const preferences = useContext(PreferenceContext);
  if (!app) throw new Error('SavedViewPreview requires PlatformProvider');
  const [url, setUrl] = useState(href);
  const latest = useRef(href);
  const [slots] = useState(createViewSlotStore);
  const [tabs] = useState(() => new WeakMap<Element, PreviewTabHandler>());
  const [guard] = useState(createNavigationGuard);
  const [supports] = useState(createSupportRegistry);
  const { adapter, user, revision } = app.pub;
  const drafts = useMemo(() => createSessionDraftStore(user.id, String(revision)), [user.id, revision]);
  const previewAdapter = useMemo(() => readOnly ? {
    ...adapter, menuAction: refuseAction, saveNotice: refuseAction, deleteNotice: refuseAction,
    uploadFile: adapter.uploadFile && refuseAction, saveAnnotation: refuseWrite, deleteAnnotation: refuseWrite,
    patchPreferences: refuseWrite, importPreferences: refuseWrite,
  } : adapter, [adapter, readOnly]);
  const readOnlyPreferences = useMemo(() => preferences && {
    state: preferences.state, subscribe: preferences.subscribe, get: preferences.get, tableKey: preferences.tableKey,
    set: ignore, remove: ignore, setTable: ignore, start: ignore, stop: ignore, retry: ignore,
  }, [preferences]);
  const preview = useMemo(() => ({
    pub: { ...app.pub, adapter: previewAdapter, savedViewStore: undefined, queryHistoryStore: undefined,
      ...(readOnly ? { toggleFavorite: ignore, setPaletteOpen: ignore, setSwitcherOpen: ignore } : {}) },
    internal: { ...app.internal, guard, sessionDrafts: drafts, savedViewSupports: supports, savedViewSlots: slots },
  }), [app, previewAdapter, readOnly, guard, drafts, supports, slots]);
  const navigation = useMemo(() => createPageNavigation(href), [href]);
  const readAddress = useCallback(() => ({ url: latest.current }), []);
  const commit = useCallback<ScreenSource['commit']>((next, _how, options) => {
    if (!options?.materialize || next === latest.current) return false;
    latest.current = next; setUrl(next);
    return true;
  }, []);
  const source: ScreenSource = { url, navigation, mode: 'main', paneId: null, countsUsage: false, go: refuse, readAddress, commit };

  const { screen } = useScreenState(preview, source);
  const scopeId = screen.global.scopeId;
  useLayoutEffect(() => {
    slots.screen(JSON.stringify([view.menuId, scopeId])).apply(view.id, { tables: view.tables });
    slots.screen(JSON.stringify([view.menuId, scopeId, PANELS_SLOT])).apply(view.id, { [PANELS_SLOT]: savedPanelsSlot(view, scopeId) });
  }, [slots, scopeId, view]);
  const content = readOnly ? <PreferenceContext.Provider value={readOnlyPreferences}><PreviewTabs.Provider value={tabs}>
    <fieldset disabled style={{ height: '100%', minWidth: 0, margin: 0, padding: 0, border: 0 }}
      onClickCapture={event => { block(event); if (event.button === 0) dispatchTabGesture(tabs, event); }}
      onAuxClickCapture={block} onContextMenuCapture={block} onSubmitCapture={block}
      onPointerDownCapture={stop} onPointerUpCapture={stop} onDragStartCapture={block} onBeforeInputCapture={block}
      onWheelCapture={stop} onKeyDownCapture={event => {
        if (event.key === 'Tab') return;
        stop(event);
        if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && dispatchTabGesture(tabs, event, event.key)) event.preventDefault();
      }} onKeyUpCapture={stop}>
      {children}
    </fieldset>
  </PreviewTabs.Provider></PreferenceContext.Provider> : children;
  return <AppContext.Provider value={preview}><ScreenContext.Provider value={screen}>{content}</ScreenContext.Provider></AppContext.Provider>;
}
