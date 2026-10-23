import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, type KeyboardEvent, type RefObject } from 'react';
import type { Lang, VocComposeContext, VocComposeSlot } from '@ap/kernel';
import { Button, cn } from '@ap/ui';
import { freezeVocContext, type VocFreezeInput } from './vocContext';

const TEXT = {
  ko: { title: 'VOC 등록', close: '닫기', chips: '첨부할 화면 정보', remove: '제거', question: '작성 중인 내용을 버릴까요?', discard: '버리기', keep: '계속 작성', draft: '작성 중' },
  en: { title: 'File a VOC', close: 'Close', chips: 'Screen details to attach', remove: 'Remove', question: 'Discard what you have written?', discard: 'Discard', keep: 'Keep writing', draft: 'draft' },
} as const;

type Session = { frozen: VocFreezeInput; removed: ReadonlySet<string>; dirty: boolean };
type FocusTarget = { to: 'rail' | 'heading' | 'continue'; n: number };
type State = { session: Session | null; visible: boolean; confirming: boolean; focus: FocusTarget | null };
type Action =
  | { type: 'open'; frozen: VocFreezeInput }
  | { type: 'requestClose' }
  | { type: 'drop' }
  | { type: 'keepWriting' }
  | { type: 'hide' }
  | { type: 'removeChip'; id: string }
  | { type: 'dirty'; dirty: boolean };

const focusOn = (state: State, to: FocusTarget['to']): FocusTarget => ({ to, n: (state.focus?.n ?? 0) + 1 });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    // The Context freezes only when there is no kept session; reopening a kept one shows it unchanged (ADR-0070 decision 5).
    case 'open': return { session: state.session ?? { frozen: action.frozen, removed: new Set(), dirty: false }, visible: true, confirming: false, focus: focusOn(state, 'heading') };
    case 'requestClose':
      if (!state.visible) return state;
      if (state.confirming || state.session?.dirty) return { ...state, confirming: true, focus: focusOn(state, 'continue') };
      return { session: null, visible: false, confirming: false, focus: focusOn(state, 'rail') };
    case 'drop': return { session: null, visible: false, confirming: false, focus: focusOn(state, 'rail') };
    case 'keepWriting': return { ...state, confirming: false, focus: focusOn(state, 'heading') };
    // Another right panel took the position: the draft and its Context stay mounted behind `hidden`.
    case 'hide': return state.visible ? { ...state, visible: false, confirming: false } : state;
    case 'removeChip': return state.session === null ? state : { ...state, session: { ...state.session, removed: new Set(state.session.removed).add(action.id) } };
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
  requestClose: () => void;
  drop: () => void;
  keepWriting: () => void;
  removeChip: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSubmitted: () => void;
  /** Whether a dirty draft is kept while the drawer is hidden (the rail dot). */
  draftHidden: boolean;
};

/**
 * State of the docked VOC drawer (ADR-0070 decision 5, 06 §8): the frozen Context, the kept draft, the close confirmation and focus.
 * `snapshot` reads the host at open time; `activation` is the detail slot's counter, and a new visible detail takes the right position.
 */
export function useVocDrawer(slot: VocComposeSlot | undefined, snapshot: () => VocFreezeInput, activation: number): VocDrawerController | null {
  const [state, dispatch] = useReducer(reducer, { session: null, visible: false, confirming: false, focus: null });
  const panelId = useId();
  const railButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const seen = useRef(activation);
  useEffect(() => {
    if (seen.current === activation) return;
    seen.current = activation;
    dispatch({ type: 'hide' });
  }, [activation]);
  useEffect(() => {
    if (state.focus === null) return;
    const target = state.focus.to === 'rail' ? railButton : state.focus.to === 'heading' ? heading : keepButton;
    target.current?.focus();
  }, [state.focus]);
  const session = state.session;
  // `session` is rebuilt on every dirty flip; only these two fields shape the Context, so Compose gets a stable `context` otherwise.
  const frozen = session?.frozen ?? null;
  const removed = session?.removed ?? null;
  const context = useMemo(() => frozen === null || removed === null ? null : freezeVocContext(frozen, removed), [frozen, removed]);
  const requestClose = useCallback(() => dispatch({ type: 'requestClose' }), []);
  const drop = useCallback(() => dispatch({ type: 'drop' }), []);
  const keepWriting = useCallback(() => dispatch({ type: 'keepWriting' }), []);
  const removeChip = useCallback((id: string) => dispatch({ type: 'removeChip', id }), []);
  const onDirtyChange = useCallback((dirty: boolean) => dispatch({ type: 'dirty', dirty }), []);
  if (slot === undefined) return null;
  return {
    slot, panelId, visible: state.visible, confirming: state.confirming, context, railButton, heading, keepButton,
    toggle: () => dispatch(state.visible ? { type: 'requestClose' } : { type: 'open', frozen: snapshot() }),
    requestClose, drop, keepWriting, removeChip, onDirtyChange, onSubmitted: drop,
    draftHidden: !state.visible && session !== null && session.dirty,
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
            <button type="button" aria-label={`${item.label}: ${item.value} ${text.remove}`} onClick={() => voc.removeChip(item.id)}
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
        <slot.Compose context={context} onSubmitted={voc.onSubmitted} onCancel={voc.requestClose} onDirtyChange={voc.onDirtyChange} />
      </div>
    </div>}
  </aside>;
}
