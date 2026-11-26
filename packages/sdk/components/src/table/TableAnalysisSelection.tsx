import { createContext, use, useContext, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type Context, type ReactElement, type ReactNode } from 'react';
import { ANALYSIS_SELECTION_MAX_VALUES, useMessages, usePlatformOptional } from '@ap/kernel';
import { useOptionalAnalysisSelectionOutput } from '@ap/kernel/host';
import { Button, Popover, PopoverAnchor, PopoverContent } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PlatformColumn } from './PlatformDataTable';

type Output = NonNullable<PlatformColumn<unknown>['analysisSelectionOutput']>;
type WriterActions = {
  select: ReturnType<typeof useOptionalAnalysisSelectionOutput>['select'];
  showLimit: () => void;
};
type Writer = WriterActions & { values: readonly string[] };
const EmptyWriter = createContext<Writer | null>(null);
const Writers = createContext<ReadonlyMap<string, Context<Writer | null>>>(new Map());
const emptyValues: readonly string[] = [];
const writerKey = ({ panelId, key }: Output) => JSON.stringify([panelId, key]);

export const isSelectionValue = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

function OutputBinding({ output, writer, children }: { output: Output; writer: Context<Writer | null>; children: ReactNode }) {
  // The table's rows are a view of the dimension and cannot establish its available values.
  const { selection, select } = useOptionalAnalysisSelectionOutput(output, { subscribeHighlight: false });
  const toast = usePlatformOptional()?.toast;
  const m = useMessages(COMPONENTS_MESSAGES);
  const nextValues = selection?.shape === 'set' ? selection.values : emptyValues;
  const [values, setValues] = useState(nextValues);
  if (values.length !== nextValues.length || !values.every((value, index) => value === nextValues[index])) setValues(nextValues);

  // Keep event handlers current without broadcasting unrelated platform updates to this writer's cells.
  const actions = useRef<WriterActions>({
    select, showLimit: () => toast?.(m('chartSetLimit', { limit: ANALYSIS_SELECTION_MAX_VALUES })),
  });
  useLayoutEffect(() => {
    actions.current = { select, showLimit: () => toast?.(m('chartSetLimit', { limit: ANALYSIS_SELECTION_MAX_VALUES })) };
  }, [select, toast, m]);
  const value = useMemo<Writer>(() => ({
    values,
    select: next => actions.current.select(next),
    showLimit: () => actions.current.showLimit(),
  }), [values]);
  return <writer.Provider value={value}>{children}</writer.Provider>;
}

export function TableAnalysisOutputs<T>({ columns, children }: { columns: readonly PlatformColumn<T>[]; children: ReactNode }) {
  // Use one context per declared writer so a changed selection reaches only its own subscribers.
  // Sorting the identity keeps the providers in place when columns are reordered.
  const keys = useMemo(() => JSON.stringify([...new Set(columns.flatMap(({ analysisSelectionOutput }) =>
    analysisSelectionOutput ? [writerKey(analysisSelectionOutput)] : [],
  ))].sort()), [columns]);
  const { bindings, writers } = useMemo(() => {
    const bindings = (JSON.parse(keys) as string[]).map(id => {
      const [panelId, key] = JSON.parse(id) as [string, string];
      return { id, output: { panelId, key }, writer: createContext<Writer | null>(null) };
    });
    return { bindings, writers: new Map(bindings.map(({ id, writer }) => [id, writer])) };
  }, [keys]);
  return <Writers.Provider value={writers}>
    {bindings.reduceRight((content, { id, output, writer }) =>
      <OutputBinding key={id} output={output} writer={writer}>{content}</OutputBinding>, children)}
  </Writers.Provider>;
}

export type AnalysisCellHandlers = Pick<ComponentProps<'div'>, 'aria-haspopup' | 'aria-expanded' | 'onClick' | 'onDoubleClick' | 'onContextMenu' | 'onKeyDown'>;
const control = 'a, button, input, select, textarea, [contenteditable="true"]';
const additive = (event: { metaKey: boolean; shiftKey: boolean }) => event.metaKey || event.shiftKey;

export function AnalysisSelectionCell({ output, value, enabled, navigate, render }: {
  output: Output; value: string; enabled: boolean;
  navigate: ComponentProps<'div'>['onKeyDown'];
  render: (selected: boolean, handlers: AnalysisCellHandlers) => ReactElement;
}) {
  const selection = use(useContext(Writers).get(writerKey(output)) ?? EmptyWriter);
  const m = useMessages(COMPONENTS_MESSAGES);
  const owner = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = enabled && openFor === value;
  if (openFor !== null && !open) setOpenFor(null);
  const values = selection?.values ?? emptyValues;
  const selected = values.includes(value);
  const atLimit = !selected && values.length >= ANALYSIS_SELECTION_MAX_VALUES;
  const narrow = m('tableSelectionNarrow');
  const choose = ({ add }: { add: boolean }) => {
    if (!enabled) return;
    if (add && atLimit) { selection?.showLimit(); return; }
    let next = [value];
    if (add) next = selected ? values.filter(item => item !== value) : [...values, value];
    selection?.select(next.length ? { shape: 'set', values: next } : null);
  };
  const finish = (options: { add: boolean }) => {
    returnFocus.current = true;
    choose(options);
    setOpenFor(null);
  };
  const handlers: AnalysisCellHandlers = {
    'aria-haspopup': enabled ? 'dialog' : undefined,
    'aria-expanded': enabled ? open : undefined,
    onClick: event => {
      if (event.target instanceof Element && event.target.closest(control)) return;
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      choose({ add: additive(event) });
    },
    onDoubleClick: event => { if (event.target instanceof Element && !event.target.closest(control)) event.stopPropagation(); },
    onContextMenu: event => {
      if (!enabled || (event.target instanceof Element && event.target.closest(control))) return;
      event.preventDefault();
      event.stopPropagation();
      setOpenFor(value);
    },
    onKeyDown: event => {
      if (event.target !== event.currentTarget) return;
      if (enabled && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
        event.preventDefault();
        setOpenFor(value);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose({ add: additive(event) });
      } else navigate?.(event);
    },
  };
  return <Popover open={open} onOpenChange={next => setOpenFor(next ? value : null)}>
    <PopoverAnchor ref={owner} asChild>{render(selected, handlers)}</PopoverAnchor>
    {open && <PopoverContent align="start" padding="compact" className="w-auto min-w-40" aria-label={narrow}
      onEscapeKeyDown={() => { returnFocus.current = true; }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (returnFocus.current) owner.current?.focus({ preventScroll: true });
        returnFocus.current = false;
      }}>
      <div className="grid">
        <Button type="button" variant="ghost" size="toolbar" className="justify-start" onClick={() => finish({ add: false })}>{narrow}</Button>
        <Button type="button" variant="ghost" size="toolbar" className="justify-start" disabled={atLimit} onClick={() => finish({ add: true })}>
          {selected ? m('tableSelectionRemove') : m('tableSelectionAdd')}
        </Button>
      </div>
    </PopoverContent>}
  </Popover>;
}
