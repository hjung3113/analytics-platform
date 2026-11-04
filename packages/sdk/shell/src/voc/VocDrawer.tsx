import { X } from 'lucide-react';
import { createContext, useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, type KeyboardEvent, type RefObject } from 'react';
import type { Lang, VocComposeContext, VocComposeSlot } from '@ap/kernel';
import { Button, cn, TransientOverlayScope } from '@ap/ui';
import { freezeVocContext, type VocFreezeInput } from './vocContext';

const TEXT = {
  ko: { title: 'VOC 등록', close: '닫기', chips: '첨부할 화면 정보', remove: '제거', question: '작성 중인 내용을 버릴까요?', discard: '버리기', keep: '계속 작성', draft: '작성 중' },
  en: { title: 'File a VOC', close: 'Close', chips: 'Screen details to attach', remove: 'Remove', question: 'Discard what you have written?', discard: 'Discard', keep: 'Keep writing', draft: 'draft' },
} as const;

type Session = { frozen: VocFreezeInput; removed: ReadonlySet<string>; dirty: boolean };
/** `chip` carries the id of the chip whose remove button takes focus. */
type FocusTarget = { to: 'rail' | 'heading' | 'continue'; n: number } | { to: 'chip'; id: string; n: number };
/** `owner` is the Kernel session the draft belongs to; `activation` is the detail slot counter at the time the drawer was shown; `gen` counts the ended drafts, so callbacks of a gone Compose can be told apart.
 * `pending` is an error-report session waiting behind the discard question of a dirty draft (#606); `submittedTraces` holds the trace id of every error report that was filed and whose error screen is still alive: one receipt per error, so a later ordinary submission or another error's report keeps it. */
type State = { owner: unknown; gen: number; activation: number; session: Session | null; visible: boolean; confirming: boolean; focus: FocusTarget | null; pending: VocFreezeInput | null; submittedTraces: ReadonlySet<string> };
type Action =
  | { type: 'open'; frozen: VocFreezeInput; activation: number }
  | { type: 'openError'; frozen: VocFreezeInput; activation: number }
  | { type: 'reset'; owner: unknown }
  | { type: 'requestClose' }
  | { type: 'drop'; openPending: boolean }
  | { type: 'submitted' }
  | { type: 'forget'; traceId: string }
  | { type: 'keepWriting' }
  | { type: 'hide' }
  | { type: 'removeChip'; id: string }
  | { type: 'dirty'; dirty: boolean };

const focusOn = (state: State, to: 'rail' | 'heading' | 'continue'): FocusTarget => ({ to, n: (state.focus?.n ?? 0) + 1 });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    // The Context freezes only when there is no kept session; reopening a kept one shows it unchanged (ADR-0070 decision 5).
    case 'open': return { ...state, pending: null, activation: action.activation, session: state.session ?? { frozen: action.frozen, removed: new Set(), dirty: false }, visible: true, confirming: false, focus: focusOn(state, 'heading') };
    // The error view's report (#606): a clean or absent session is replaced by the error one; a dirty draft is never overwritten, so the discard question comes first and the error session waits behind it.
    case 'openError':
      if (state.session?.dirty) return { ...state, activation: action.activation, visible: true, confirming: true, pending: action.frozen, focus: focusOn(state, 'continue') };
      return { ...state, gen: state.gen + 1, activation: action.activation, session: { frozen: action.frozen, removed: new Set(), dirty: false }, visible: true, confirming: false, pending: null, focus: focusOn(state, 'heading') };
    // A new session owner or a removed slot discards the frozen Context, the draft and the confirmation; focus is left where it is.
    case 'reset': return { owner: action.owner, gen: state.gen + 1, activation: state.activation, session: null, visible: false, confirming: false, focus: state.focus, pending: null, submittedTraces: new Set() };
    case 'requestClose':
      if (!state.visible) return state;
      if (state.confirming || state.session?.dirty) return { ...state, confirming: true, focus: focusOn(state, 'continue') };
      return { ...state, gen: state.gen + 1, session: null, visible: false, confirming: false, focus: focusOn(state, 'rail') };
    case 'drop':
      if (action.openPending && state.pending !== null) return { ...state, gen: state.gen + 1, session: { frozen: state.pending, removed: new Set(), dirty: false }, visible: true, confirming: false, pending: null, focus: focusOn(state, 'heading') };
      return { ...state, gen: state.gen + 1, session: null, visible: false, confirming: false, pending: null, focus: focusOn(state, 'rail') };
    case 'submitted': {
      const filed = state.session?.frozen.error?.traceId ?? null;
      return { ...state, gen: state.gen + 1, session: null, visible: false, confirming: false, pending: null, submittedTraces: filed === null ? state.submittedTraces : new Set(state.submittedTraces).add(filed), focus: focusOn(state, 'rail') };
    }
    case 'forget': {
      if (!state.submittedTraces.has(action.traceId)) return state;
      const next = new Set(state.submittedTraces);
      next.delete(action.traceId);
      return { ...state, submittedTraces: next };
    }
    case 'keepWriting': return { ...state, confirming: false, pending: null, focus: focusOn(state, 'heading') };
    // Another right panel took the position: the draft and its Context stay mounted behind `hidden`.
    // The confirmation it was asking is abandoned, and so is the report waiting behind it.
    case 'hide': return state.visible ? { ...state, visible: false, confirming: false, pending: null } : state;
    // The removed button leaves the DOM: focus goes to the next chip, else the previous one, else the heading (06 §26).
    case 'removeChip': {
      if (state.session === null) return state;
      const ids = freezeVocContext(state.session.frozen, state.session.removed).items.map(item => item.id);
      const at = ids.indexOf(action.id);
      const neighbour = at === -1 ? undefined : ids[at + 1] ?? ids[at - 1];
      const focus = at === -1 ? state.focus : neighbour === undefined ? focusOn(state, 'heading') : { to: 'chip' as const, id: neighbour, n: (state.focus?.n ?? 0) + 1 };
      return { ...state, focus, session: { ...state.session, removed: new Set(state.session.removed).add(action.id) } };
    }
    case 'dirty': return state.session === null || state.session.dirty === action.dirty ? state : { ...state, session: { ...state.session, dirty: action.dirty } };
  }
}

export type VocDrawerController = {
  slot: VocComposeSlot;
  panelId: string;
  visible: boolean;
  confirming: boolean;
  context: VocComposeContext | null;
  railButton: RefObject<HTMLButtonElement | null>;
  heading: RefObject<HTMLHeadingElement | null>;
  keepButton: RefObject<HTMLButtonElement | null>;
  toggle: () => void;
  /** Opens the drawer from a screen's error view with the trace and menu chips added (#606); `screen` is the snapshot of the failing screen itself (a board pane's own route and Context, not the main screen's); a dirty draft is kept until the user discards it. */
  openError: (traceId: string, screen: VocFreezeInput) => void;
  /** Counts the ended drafts: the Compose of a new draft is a new instance. */
  generation: number;
  /** The trace ids of the error reports that were filed, one per live error. */
  submittedTraces: ReadonlySet<string>;
  /** Drops the receipt of an error whose screen went away. */
  forgetTrace: (traceId: string) => void;
  requestClose: () => void;
  drop: () => void;
  keepWriting: () => void;
  removeChip: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  /** The three below are for the mounted Compose: calls from an instance whose draft has ended are ignored. */
  onSubmitted: () => void;
  onCancel: () => void;
  /** Whether a dirty draft is kept while the drawer is hidden (the rail dot). */
  draftHidden: boolean;
};

/** The drawer controller for the rail button: shell-internal (not exported from the package), so the public `AppRail()` stays prop-less. */
export const VocDrawerContext = createContext<VocDrawerController | null>(null);

/**
 * State of the docked VOC drawer (ADR-0070 decision 5, 06 §8): the frozen Context, the kept draft, the close confirmation and focus.
 * `snapshot` reads the host at open time; `activation` is the detail slot's counter, and a new visible detail takes the right position.
 * `owner` is the Kernel session: when it changes, or the slot disappears, the Context and the draft are dropped in that same render.
 */
export function useVocDrawer(slot: VocComposeSlot | undefined, snapshot: () => VocFreezeInput, activation: number, owner: unknown): VocDrawerController | null {
  const [state, dispatch] = useReducer(reducer, owner, (initial): State => ({ owner: initial, gen: 0, activation, session: null, visible: false, confirming: false, focus: null, pending: null, submittedTraces: new Set() }));
  if (state.owner !== owner || (slot === undefined && (state.session !== null || state.visible))) dispatch({ type: 'reset', owner });
  const panelId = useId();
  const railButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  // The element that opened the drawer from an error view; closing returns focus there while it is still on the page, else to the rail button.
  const opener = useRef<HTMLElement | null>(null);
  // The visible flag follows the activation in the same render, so a new detail's first focus lands in a visible aside; the effect only syncs the stored state.
  const visible = state.visible && state.activation === activation;
  const stale = state.visible && !visible;
  useEffect(() => { if (stale) dispatch({ type: 'hide' }); }, [stale]);
  useEffect(() => {
    if (state.focus === null) return;
    if (state.focus.to === 'chip') {
      const id = state.focus.id;
      Array.from(document.getElementById(panelId)?.querySelectorAll<HTMLElement>('[data-chip-id]') ?? []).find(button => button.dataset.chipId === id)?.focus();
      return;
    }
    if (state.focus.to === 'rail' && opener.current?.isConnected) { opener.current.focus(); return; }
    const target = state.focus.to === 'rail' ? railButton : state.focus.to === 'heading' ? heading : keepButton;
    target.current?.focus();
  }, [state.focus, panelId]);
  const session = state.session;
  // `session` is rebuilt on every dirty flip; only these two fields shape the Context, so Compose gets a stable `context` otherwise.
  const frozen = session?.frozen ?? null;
  const removed = session?.removed ?? null;
  const context = useMemo(() => frozen === null || removed === null ? null : freezeVocContext(frozen, removed), [frozen, removed]);
  // The generation of the committed state; a Compose handler captured at an older generation belongs to a draft that has ended.
  const gen = state.gen;
  const currentGen = useRef(gen);
  useLayoutEffect(() => { currentGen.current = gen; }, [gen]);
  const requestClose = useCallback(() => dispatch({ type: 'requestClose' }), []);
  const drop = useCallback(() => dispatch({ type: 'drop', openPending: true }), []);
  const keepWriting = useCallback(() => dispatch({ type: 'keepWriting' }), []);
  const forgetTrace = useCallback((traceId: string) => dispatch({ type: 'forget', traceId }), []);
  const removeChip = useCallback((id: string) => dispatch({ type: 'removeChip', id }), []);
  const onDirtyChange = useCallback((dirty: boolean) => { if (currentGen.current === gen) dispatch({ type: 'dirty', dirty }); }, [gen]);
  const onSubmitted = useCallback(() => { if (currentGen.current === gen) dispatch({ type: 'submitted' }); }, [gen]);
  const onCancel = useCallback(() => { if (currentGen.current === gen) dispatch({ type: 'requestClose' }); }, [gen]);
  if (slot === undefined) return null;
  return {
    slot, panelId, visible, confirming: state.confirming && visible, context, railButton, heading, keepButton,
    toggle: () => { opener.current = null; dispatch(visible ? { type: 'requestClose' } : { type: 'open', frozen: snapshot(), activation }); },
    openError: (traceId: string, frozen: VocFreezeInput) => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dispatch({ type: 'openError', activation, frozen: { ...frozen, error: { traceId, menuId: frozen.route?.menu.id ?? null, menuLabel: frozen.route?.menu.label[frozen.lang] ?? null } } });
    },
    generation: state.gen, submittedTraces: state.submittedTraces, forgetTrace,
    requestClose, drop, keepWriting, removeChip, onDirtyChange, onSubmitted, onCancel,
    draftHidden: !visible && session !== null && session.dirty,
  };
}

/** The shell-owned right position for the VOC form: pushes the body, no overlay or scrim, and keeps the content mounted while hidden. */
export function VocDrawer({ voc, lang }: { voc: VocDrawerController; lang: Lang }) {
  const text = TEXT[lang];
  const { context, slot } = voc;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Portaled overlays (Popover, Select) bubble through React: only keys whose DOM target is inside the aside count.
    if (event.key !== 'Escape' || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
    event.preventDefault();
    voc.requestClose();
  };
  return <aside id={voc.panelId} aria-label={text.title} hidden={!voc.visible} data-open={voc.visible} onKeyDown={onKeyDown}
    className={cn('flex h-full max-w-[520px] shrink-0 flex-col overflow-hidden border-border-subtle bg-surface-detail',
      voc.visible ? 'w-[clamp(360px,var(--detail-panel-width,440px),520px)] min-w-[360px] border-l' : 'w-0 min-w-0 border-l-0')}>
    <header className="flex h-[50px] shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4">
      <h2 ref={voc.heading} tabIndex={-1} className="t-card-title outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{text.title}</h2>
      <Button type="button" variant="ghost" size="sm" onClick={voc.requestClose}>{text.close}</Button>
    </header>
    {context !== null && <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section aria-label={text.chips} className="shrink-0 border-b border-border-subtle px-4 py-2">
        <p className="mb-1 text-caption text-text-muted">{text.chips}</p>
        <ul className="flex flex-wrap gap-1.5">
          {context.items.map(item => <li key={item.id} className="min-w-0 max-w-full">
            <button type="button" data-chip-id={item.id} aria-label={`${item.label}: ${item.value} ${text.remove}`} onClick={() => voc.removeChip(item.id)}
              className="inline-flex max-w-full items-center gap-1 rounded-pill border border-border-default bg-surface-card px-2 py-0.5 text-caption hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
              <span className="text-text-muted">{item.label}</span><span className="min-w-0 truncate">{item.value}</span><X className="size-3 shrink-0" aria-hidden />
            </button>
          </li>)}
        </ul>
      </section>
      {voc.confirming && <div role="alert" className="shrink-0 border-b border-border-subtle bg-surface-sunken px-4 py-3">
        <p className="mb-2 text-sm">{text.question}</p>
        <div className="flex gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={voc.drop}>{text.discard}</Button>
          <Button ref={voc.keepButton} type="button" variant="outline" size="sm" onClick={voc.keepWriting}>{text.keep}</Button>
        </div>
      </div>}
      <div className="min-h-0 flex-1">
        <TransientOverlayScope active={voc.visible}>
          <slot.Compose key={voc.generation} context={context} onSubmitted={voc.onSubmitted} onCancel={voc.onCancel} onDirtyChange={voc.onDirtyChange} />
        </TransientOverlayScope>
      </div>
    </div>}
  </aside>;
}
