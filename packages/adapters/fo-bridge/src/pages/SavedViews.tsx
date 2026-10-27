import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bookmark, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useI18n, usePlatform } from '@ap/kernel';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { createSavedView, deleteSavedView, fetchSavedViews, type SavedView } from '@/lib/api/saved-views';
import { savedViewFilterToVocSearch, vocSearchToSavedViewFilter } from '@/features/voc/lib/saved-view-keys';
import { searchHref } from '@/lib/host/search';
import { foQueryClient } from '../fo/session';
import { isReachable } from '../fo/reachable';
import { operatorHostLinks } from '../fo/operator-links';
import { inboxRoute, triageRoute } from '../fo/voc-routes';

const NO_VIEWS: SavedView[] = [];
const QUERY_KEY = ['saved-views', 'voc'] as const;
const SAVE_ROUTES = { 'fo-inbox': inboxRoute, 'fo-triage': triageRoute } as const;

type Recovery = { order: string[]; deletedIndex: number };

/**
 * The FeedbackOps saved VOC views for a ready session (the original `SavedViewsSection`, #595 4c): apply, delete, and save the current 수신함/Triage filter.
 * Applying lands on the menu the stored `view` maps to with exactly the stored keys; every other key, a carried `managedSystem` included, is cleared.
 */
export default function SavedViews() {
  const { lang } = useI18n();
  const { route, page, registry, linkTo, navigate, toast } = usePlatform();
  const ko = lang === 'ko';
  const [name, setName] = useState('');
  const [recovery, setRecovery] = useState(() => new Map<string, Recovery>());
  const sectionRef = useRef<HTMLDivElement | null>(null);
  // A recovery belongs to the route it was armed on: a route (menu or page) change drops the armed ones and rejects deletes still in flight.
  const routeKey = `${route?.menu.id ?? ''}|${JSON.stringify([...page])}`;
  const [seenRouteKey, setSeenRouteKey] = useState(routeKey);
  if (seenRouteKey !== routeKey) {
    setSeenRouteKey(routeKey);
    setRecovery(new Map());
  }
  const generation = useRef(0);
  useEffect(() => { generation.current += 1; }, [routeKey]);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: QUERY_KEY, queryFn: ({ signal }) => fetchSavedViews('voc', signal), retry: false }, foQueryClient);
  const views = data?.items ?? NO_VIEWS;
  const saveRoute = route !== null && route.menu.id in SAVE_ROUTES ? SAVE_ROUTES[route.menu.id as keyof typeof SAVE_ROUTES] : null;

  // #972 focus recovery: once a deleted row has left the list, focus the next surviving row, else the previous, else the save input; only when focus is free.
  useEffect(() => {
    if (recovery.size === 0) return;
    const survivors = new Set(views.map(view => view.id));
    const inFlight = new Set(recovery.keys());
    const section = sectionRef.current;
    let next: Map<string, Recovery> | null = null;
    let rowTarget: HTMLElement | null = null;
    let inputFallback = false;
    for (const [deletedId, capture] of recovery) {
      if (survivors.has(deletedId)) continue;
      inFlight.delete(deletedId);
      next ??= new Map(recovery);
      next.delete(deletedId);
      if (rowTarget !== null) continue;
      const pick = (ids: string[]) => ids.find(id => survivors.has(id) && !inFlight.has(id));
      const targetId = pick(capture.order.slice(capture.deletedIndex + 1)) ?? pick(capture.order.slice(0, capture.deletedIndex).reverse()) ?? null;
      if (targetId !== null) rowTarget = section?.querySelector<HTMLElement>(`[data-saved-view-apply="${targetId}"]`) ?? null;
      if (rowTarget === null) inputFallback = true;
    }
    let target = rowTarget;
    if (target === null && inputFallback) target = section?.querySelector<HTMLElement>('input[aria-label="저장된 보기 이름"]') ?? null;
    if (next !== null) setRecovery(next);
    const active = document.activeElement;
    const free = active === null || active === document.body || (section?.contains(active) ?? false);
    if (target !== null && free) target.focus();
  }, [recovery, views]);

  const fail = (error: unknown) => {
    const mapped = mapUnknownError(error);
    toast(mapped.message, mapped.tone === 'error' ? 'danger' : mapped.tone);
  };

  const apply = (view: SavedView) => {
    const record: Record<string, string> = {};
    const stored = savedViewFilterToVocSearch(view.filter);
    record.view = typeof stored.view === 'string' && stored.view !== '' ? stored.view : 'inbox';
    for (const [key, value] of Object.entries(stored)) if (key !== 'view' && typeof value === 'string') record[key] = value;
    const target = operatorHostLinks.targetOf(searchHref('/vocs', record));
    if (!isReachable(registry, target)) return;
    const next = { ...target.page };
    if (next.managedSystem === undefined || next.managedSystem === 'all') next.managedSystem = null;
    // Applying a view starts a new list, not a way back: the return line goes away (#760, ADR-0081 UX-10). An explicit null omits a carried key.
    next.returnTo = null;
    navigate(linkTo(target.menuId, { page: next }));
  };

  const remove = (view: SavedView) => {
    const order = views.map(item => item.id);
    const capture = { order, deletedIndex: order.indexOf(view.id) };
    const armedIn = generation.current;
    deleteSavedView(view.id).then(
      () => {
        if (generation.current === armedIn) setRecovery(prev => prev.has(view.id) ? prev : new Map(prev).set(view.id, capture));
        void refetch();
      },
      fail,
    );
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || saveRoute === null) return;
    const record: Record<string, string> = {};
    // First pair wins, as `pageParam` reads it.
    for (const [key, value] of page) if (!(key in record)) record[key] = value;
    const filter = vocSearchToSavedViewFilter(saveRoute.toFoSearch(record), 'inbox');
    createSavedView({ surface: 'voc', name: trimmed, filter }).then(() => { setName(''); void refetch(); }, fail);
  };

  const showHint = views.length === 0 && saveRoute === null && !isPending;
  return <div ref={sectionRef}>
    {views.map(view => <div key={view.id} className="group flex items-center gap-1">
      <button type="button" title={view.name} data-saved-view-apply={view.id} onClick={() => apply(view)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary">
        <Bookmark className="size-3.5 shrink-0" aria-hidden /><span className="block truncate">{view.name}</span>
      </button>
      <button type="button" aria-label={`저장된 보기 ${view.name} 삭제`} onClick={() => remove(view)}
        className="mr-1 rounded p-1 text-text-muted opacity-0 hover:text-accent-danger group-hover:opacity-100 focus:opacity-100">
        <X className="size-3.5" aria-hidden />
      </button>
    </div>)}
    {isPending && <p className="px-3 py-1 text-xs leading-4 text-text-muted">{ko ? '불러오는 중…' : 'Loading…'}</p>}
    {isError && views.length === 0 && <p className="px-3 py-1 text-xs leading-4 text-text-muted">{ko ? '저장된 보기를 불러오지 못했습니다.' : 'Could not load saved views.'}</p>}
    {showHint && !isError && <p className="px-3 py-1 text-xs leading-4 text-text-muted">{ko ? '수신함이나 Triage에서 현재 필터를 저장할 수 있습니다.' : 'Save the current filter from Inbox or Triage.'}</p>}
    {saveRoute !== null && <form className="mt-1 flex gap-1 px-2" onSubmit={save}>
      <input value={name} onChange={event => setName(event.target.value)} maxLength={120} required aria-label="저장된 보기 이름" placeholder="현재 필터 저장"
        className="min-w-0 flex-1 rounded border border-border-subtle bg-surface-canvas px-2 py-1 text-xs" />
      <button type="submit" className="rounded px-2 py-1 text-xs text-accent-primary hover:bg-surface-row-hover">저장</button>
    </form>}
  </div>;
}
