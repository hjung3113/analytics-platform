import { useEffect, useEffectEvent, useId, useState, type ReactNode } from 'react';
import { ChevronDown, Inbox, ServerCrash } from 'lucide-react';
import { pageConditionKeys, wallClockEpochMs, type PageConditionCategory, type PageConditionOption, type PageConditions, type Pair, type HierarchySource } from '@ap/contracts';
import { decodePageConditions, encodePageConditions, PAGE_CONDITION_EMPTY, PageConditionError, useI18n, useMessages, type PageConditionIssue, type PageConditionValue, type PageConditionValues } from '@ap/kernel';
import { Button, Checkbox, GROUPED_SELECTION_MESSAGES, GroupedSelectionList, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useImeEnterGuard } from '@ap/ui';
import { LoadingBlock, OutcomeView, StateMessage } from '../StateView';
import { PAGE_CONDITION_ISSUE_MESSAGES, PAGE_CONDITION_MESSAGES } from './pageConditionMessages';
import { checkPageConditionOptions, type PageConditionOptions, type PageConditionOptionsLoader } from './pageConditionOptions';
import { PageConditionTree } from './PageConditionTree';
import { PageConditionOptionsError } from './usePageConditionOptionsLoader';

export type PageConditionCategoriesProps = {
  declaration: PageConditions;
  values: PageConditionValues;
  /** S1 rejects malformed categories atomically. Keep their original pairs here for recovery in the control. */
  rawPairs?: readonly Pair[];
  issues?: readonly PageConditionIssue[];
  /** Category-local decoded key map replaces that category's keys; null removes every owned key (no constraint). */
  onChange: (categoryId: string, nextDecoded: PageConditionValues | null) => void;
  loadOptions?: PageConditionOptionsLoader;
  /** Sources keyed by the declared tree endpoint id; their owner preserves server permission gates. */
  treeSources?: Readonly<Record<string, HierarchySource | undefined>>;
  /** Full option identity: session generation, Scope, projected Context, declared endpoint inputs and readiness. */
  inputsKey: string;
};
export type { PageConditionOptions, PageConditionOptionsLoader } from './pageConditionOptions';

type CategoryProps = PageConditionCategoriesProps & { category: PageConditionCategory };
type OptionsState = { status: 'loading' } | { status: 'ready'; data: PageConditionOptions } | { status: 'error'; error: unknown };
const NO_OPTIONS: PageConditionOptions = { options: [] };
const NO_ISSUES: readonly PageConditionIssue[] = [];
const NO_PAIRS: readonly Pair[] = [];
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const WALL_CLOCK_MINUTES = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function arrayValue(value: PageConditionValue | undefined): readonly string[] {
  return Array.isArray(value) ? value : [];
}
function localValues(category: PageConditionCategory, values: PageConditionValues): PageConditionValues {
  return Object.fromEntries(pageConditionKeys(category).filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]));
}
function replaceValues(category: PageConditionCategory, values: PageConditionValues, next: PageConditionValues | null): PageConditionValues {
  const result = { ...values };
  for (const key of pageConditionKeys(category)) delete result[key];
  return { ...result, ...next };
}
function compactValues(values: PageConditionValues): PageConditionValues | null {
  return Object.keys(values).length ? values : null;
}

/** A declaration-ordered, controlled editor. The parent owns URL/draft/apply and the single scroll layer. */
export function PageConditionCategories(props: PageConditionCategoriesProps) {
  // Remounting on declared inputs removes stale options before paint and aborts every previous request.
  return <CategorySequence key={JSON.stringify([props.inputsKey, props.declaration])} {...props} />;
}
function CategorySequence(props: PageConditionCategoriesProps) {
  const { lang } = useI18n();
  const runs: { key: string; section?: NonNullable<PageConditions['sections']>[number]; categories: PageConditionCategory[] }[] = [];
  // Sections are visual only: even a noncontiguous section never reorders the declaration.
  for (const category of props.declaration.categories) {
    const section = props.declaration.sections?.find(item => item.categories.includes(category.id));
    const last = runs.at(-1);
    if (section && last?.section?.id === section.id) last.categories.push(category);
    else runs.push({ key: category.id, section, categories: [category] });
  }
  return <div className="min-w-0 space-y-4 break-keep">
    {runs.map(run => {
      const content = run.categories.map(category => <ConditionCategory key={category.id} {...props} category={category} />);
      return run.section ? <CategoryFold key={run.key} label={run.section.label[lang]}>{content}</CategoryFold> : <div key={run.key} className="space-y-4">{content}</div>;
    })}
  </div>;
}
function CategoryFold({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(true);
  return <section className="min-w-0 space-y-3" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}><Button type="button" variant="ghost" size="toolbar" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(previous => !previous)}>
      <ChevronDown aria-hidden className="size-3.5" />{label}
    </Button></h3>
    <div id={`${id}-body`} hidden={!open} className="space-y-4">{children}</div>
  </section>;
}
function useOptions(category: PageConditionCategory, loadOptions?: PageConditionOptionsLoader) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<OptionsState>({ status: 'loading' });
  const kind = category.kind;
  const dynamic = kind.type === 'groupedChecks' || ((kind.type === 'select' || kind.type === 'multi') && 'endpoint' in kind.options);
  // Loader callbacks often close over fresh params. inputsKey, not function identity, owns reloads.
  const load = useEffectEvent(async (signal: AbortSignal) => {
    if (!loadOptions) throw new Error('No page condition options loader supplied');
    return checkPageConditionOptions(category, await loadOptions(category, { signal }));
  });
  useEffect(() => {
    if (!dynamic) return;
    const controller = new AbortController();
    void load(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ status: 'ready', data });
    }, error => {
      // Only our own abort means superseded; a loader timeout/AbortError is a visible failure.
      if (!controller.signal.aborted) setState({ status: 'error', error });
    });
    return () => controller.abort();
  }, [dynamic, attempt]);
  function retry() { setState({ status: 'loading' }); setAttempt(previous => previous + 1); }
  if (!dynamic) {
    const data = (kind.type === 'select' || kind.type === 'multi') && 'static' in kind.options ? { options: kind.options.static } : NO_OPTIONS;
    return { state: { status: 'ready', data } as OptionsState, retry };
  }
  return { state, retry };
}

function ConditionCategory(props: CategoryProps) {
  return props.category.kind.type === 'tree'
    ? <PageConditionTree {...props} source={props.treeSources?.[props.category.kind.source]} />
    : <OptionConditionCategory {...props} />;
}
function OptionConditionCategory(props: CategoryProps) {
  const { category, declaration, values, onChange, issues = NO_ISSUES, rawPairs = NO_PAIRS } = props;
  const { lang } = useI18n();
  const m = useMessages(PAGE_CONDITION_MESSAGES);
  const issueMessage = useMessages(PAGE_CONDITION_ISSUE_MESSAGES);
  const prefix = useId();
  const [refusal, setRefusal] = useState<string | null>(null);
  const { state, retry } = useOptions(category, props.loadOptions);
  const owned = localValues(category, values);
  const localIssues = issues.filter(issue => issue.categoryId === category.id);
  const raw = rawPairs.filter(([key]) => pageConditionKeys(category).includes(key));
  const disabled = !!category.disabled;
  const kind = category.kind;
  const reasonsId = `${prefix}-reasons`;
  const reasons = [...localIssues.map(issue => issueMessage(issue.reason)), ...(refusal ? [refusal] : [])];
  const description = [category.disabled?.reason[lang], ...reasons];
  const hasError = reasons.length > 0;
  const describedBy = category.disabled || hasError ? reasonsId : undefined;
  const count = Object.values(owned).reduce((total, value) => total + arrayValue(value).length, 0);
  const repeated = kind.type === 'multi' || kind.type === 'groupedChecks';
  const explicitEmpty = repeated && Object.keys(owned).length > 0 && count === 0;
  const common = { disabled, 'aria-describedby': describedBy, 'aria-invalid': hasError || undefined };
  function change(next: PageConditionValues | null) {
    if (disabled) return;
    if (next !== null) {
      try { encodePageConditions({ pageConditions: declaration }, replaceValues(category, values, next)); }
      catch (error) {
        if (!(error instanceof PageConditionError)) throw error;
        setRefusal(error.issues.map(issue => issueMessage(issue.reason)).join(' '));
        return;
      }
    }
    setRefusal(null);
    onChange(category.id, next);
  }
  function write(key: string, value: PageConditionValue | null) {
    if (repeated && localIssues.length > 0 && raw.length > 0) {
      // S1 rejected the entire category. Replace only the edited key's pairs, then decode
      // the complete candidate so untouched siblings cannot disappear or be repaired.
      const menu = { pageConditions: { categories: [category] } };
      const keyPairs = raw.filter(([name]) => name === key);
      const before = decodePageConditions(menu, keyPairs);
      const retainedMalformed = before.issues.length > 0 && arrayValue(value ?? undefined).some(item => keyPairs.some(([, original]) => item === original) && (item === PAGE_CONDITION_EMPTY || decodePageConditions(menu, [[key, item]]).issues.length > 0));
      if (retainedMalformed) { setRefusal(issueMessage('invalid-value')); return; }
      try {
        const changed = encodePageConditions(menu, value === null ? {} : { [key]: value });
        const decoded = decodePageConditions(menu, [...raw.filter(([name]) => name !== key), ...changed]);
        if (decoded.issues.length > 0) { setRefusal(decoded.issues.map(issue => issueMessage(issue.reason)).join(' ')); return; }
        change(compactValues(decoded.values));
      } catch (error) {
        if (!(error instanceof PageConditionError)) throw error;
        setRefusal(error.issues.map(issue => issueMessage(issue.reason)).join(' '));
      }
      return;
    }
    const next = Object.fromEntries(Object.entries(owned).filter(([name]) => name !== key));
    change(compactValues({ ...next, ...(value === null ? {} : { [key]: value }) }));
  }
  const valuesFor = (key: string) => {
    if (localIssues.length > 0 && raw.some(([name]) => name === key)) {
      const pairs = raw.filter(([name]) => name === key);
      if (repeated) {
        const decoded = decodePageConditions({ pageConditions: { categories: [category] } }, pairs);
        if (decoded.issues.length === 0) return arrayValue(decoded.values[key]);
      }
      return pairs.map(([, value]) => value);
    }
    return arrayValue(owned[key]);
  };
  const flatOptions = state.status === 'ready' && 'options' in state.data ? state.data.options : [];
  function optionState() {
    if (state.status === 'loading') return <LoadingBlock rows={2} />;
    if (state.status === 'error') {
      if (state.error instanceof PageConditionOptionsError) return <OutcomeView response={state.error.response} onRetry={retry} compact>{() => null}</OutcomeView>;
      return <StateMessage compact tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={m('error')}
        detail={state.error instanceof Error ? state.error.message : undefined}
        action={<Button type="button" variant="secondary" size="toolbar" onClick={retry}>{m('retry')}</Button>} />;
    }
    return null;
  }
  function unknown(key: string, options: readonly PageConditionOption[]) {
    // Loading or failure is not evidence that a retained id is unavailable. Show its raw form honestly.
    const unavailable = state.status === 'ready';
    return valuesFor(key).map((value, index) => ({ value, index })).filter(({ value }) => !options.some(option => option.value === value)).map(({ value, index }) => <div key={`${key}:${index}`} className="flex min-w-0 items-center justify-between gap-2 text-xs text-text-secondary">
      <span className="min-w-0 break-all">{m(unavailable ? 'unavailable' : 'retained', { value })}</span>
      <Button type="button" variant="ghost" size="toolbar" disabled={disabled} aria-label={m('clearOne', { label: value })} aria-describedby={reasonsId}
        onClick={() => {
          const remaining = valuesFor(key).filter((_, item) => item !== index);
          write(key, remaining.length || repeated ? remaining : null);
        }}>{m('clear')}</Button>
    </div>);
  }
  function emptyOptions() {
    return <StateMessage compact icon={<Inbox className="size-4" aria-hidden />} title={m('empty')} />;
  }
  function controls() {
    switch (kind.type) {
      case 'search': return <CommitInput id={`${prefix}-input`} aria-label={category.label[lang]} {...common} value={valuesFor(kind.key)[0] ?? ''} onCommit={text => write(kind.key, text === '' ? null : [text])} />;
      case 'range': {
        const value = owned[kind.key];
        const range = value && !Array.isArray(value) ? value as { min: number | null; max: number | null } : { min: null, max: null };
        const rawRange = raw.find(([key]) => key === kind.key)?.[1];
        const parts = localIssues.length && rawRange !== undefined ? rawRange.split('..') : [String(range.min ?? ''), String(range.max ?? '')];
        const unit = kind.unit?.[lang] ?? '';
        const span = kind.min !== undefined && kind.max !== undefined ? m('boundsBetween', { min: kind.min, max: kind.max, unit })
          : kind.min !== undefined ? m('boundsAtLeast', { min: kind.min, unit }) : kind.max !== undefined ? m('boundsAtMost', { max: kind.max, unit }) : null;
        const bounds = [span === null ? null : m('boundsLine', { range: span }), kind.step === undefined ? null : m('boundsStep', { step: kind.step, unit })].filter(Boolean).join(', ') || kind.unit?.[lang] || null;
        const commit = (texts: readonly string[]) => {
          if (texts.some(text => text !== '' && (!NUMBER.test(text) || !Number.isFinite(Number(text))))) { setRefusal(issueMessage('invalid-range')); return; }
          const numbers = texts.map(text => text === '' ? null : Number(text));
          if (numbers.some(number => number !== null && ((kind.min !== undefined && number < kind.min) || (kind.max !== undefined && number > kind.max) || (kind.step !== undefined && !onStep(number, kind.min ?? 0, kind.step))))) { setRefusal(bounds); return; }
          const [min, max] = numbers;
          if (min !== null && max !== null && min > max) { setRefusal(m('rangeOrder')); return; }
          write(kind.key, min === null && max === null ? null : { min, max });
        };
        return <div className="space-y-2">
          <BoundInputs columns="pair" fields={[
            { label: m('min', { label: category.label[lang] }), value: parts[0] ?? '', inputMode: 'decimal' },
            { label: m('max', { label: category.label[lang] }), value: parts[1] ?? '', inputMode: 'decimal' },
          ]} onCommit={commit} {...common} />
          {bounds && <p className="text-xs text-text-secondary">{bounds}</p>}
        </div>;
      }
      case 'date': return <div className="space-y-2">
        <BoundInputs fields={[{ key: kind.from, label: m('from', { label: category.label[lang] }) }, { key: kind.to, label: m('to', { label: category.label[lang] }) }].map(({ key, label }) => {
          const value = valuesFor(key)[0] ?? '';
          return { label, value, type: value && wallClockEpochMs(value) === null ? 'text' : 'datetime-local', step: 1 };
        })} {...common} onCommit={texts => {
          const next = { ...owned };
          for (const [index, key] of [kind.from, kind.to].entries()) {
            const text = texts[index];
            // Native datetime-local may omit zero seconds; materialize seconds without any timezone conversion.
            const value = WALL_CLOCK_MINUTES.test(text) ? `${text}:00` : text;
            if (value === '') delete next[key]; else next[key] = [value];
          }
          change(compactValues(next));
        }} />
        <p className="text-xs text-text-secondary">{m('dateFormat')}</p>
      </div>;
      case 'select': return <div className="space-y-2">
        {optionState()}
        <Select disabled={disabled || state.status !== 'ready'} value={valuesFor(kind.key)[0] ?? ''} onValueChange={value => write(kind.key, [value])}>
          <SelectTrigger aria-label={category.label[lang]} {...common}><SelectValue placeholder={m('unconstrained')} /></SelectTrigger>
          <SelectContent>{flatOptions.map(option => <SelectItem key={option.value} value={option.value} disabled={!!option.disabledReason}>{option.label[lang]}{option.disabledReason ? ` · ${option.disabledReason[lang]}` : ''}</SelectItem>)}
            {valuesFor(kind.key).filter(value => !flatOptions.some(option => option.value === value)).map((value, index) => <SelectItem key={`raw:${index}`} value={value || `invalid:${index}`} disabled>{value}</SelectItem>)}
          </SelectContent>
        </Select>
        {state.status === 'ready' && flatOptions.length === 0 && emptyOptions()}
        {unknown(kind.key, flatOptions)}
      </div>;
      case 'multi': return <div className="space-y-2">
        {optionState()}
        {flatOptions.map((option, index) => <div key={option.value} className="space-y-1">
          <div className="flex items-center gap-2"><Checkbox id={`${prefix}-option-${index}`} disabled={disabled || !!option.disabledReason} checked={valuesFor(kind.key).includes(option.value)} aria-describedby={[describedBy, option.disabledReason ? `${prefix}-option-reason-${index}` : undefined].filter(Boolean).join(' ') || undefined}
            onCheckedChange={checked => write(kind.key, checked === true ? [...valuesFor(kind.key), option.value] : valuesFor(kind.key).filter(value => value !== option.value))} />
            <Label htmlFor={`${prefix}-option-${index}`}>{option.label[lang]}</Label></div>
          {option.disabledReason && <p id={`${prefix}-option-reason-${index}`} className="text-xs text-text-secondary">{option.disabledReason[lang]}</p>}
        </div>)}
        {state.status === 'ready' && flatOptions.length === 0 && emptyOptions()}
        {unknown(kind.key, flatOptions)}
      </div>;
      case 'groupedChecks': {
        const groups = state.status === 'ready' && 'groups' in state.data ? state.data.groups : [];
        return <div className="space-y-3">{optionState()}
          {groups.map((group, groupIndex) => <section key={group.id} className="min-w-0 space-y-2" aria-labelledby={`${prefix}-group-${groupIndex}`}>
            <h4 tabIndex={-1} id={`${prefix}-group-${groupIndex}`} className="text-sm font-semibold">{group.label[lang]}</h4>
            <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
              {kind.lists.map(list => {
                const groupOptions = group.lists[list.id] ?? [];
                const selected = valuesFor(list.key);
                const explicitListEmpty = (Object.hasOwn(owned, list.key) || raw.some(([key]) => key === list.key)) && selected.length === 0;
                const messages = { ...GROUPED_SELECTION_MESSAGES[lang], selectedCount: (count: number) => explicitListEmpty ? m('explicitEmpty') : count === 0 ? m('unconstrained') : GROUPED_SELECTION_MESSAGES[lang].selectedCount(count) };
                return <GroupedSelectionList key={list.id} mode="multiple" aria-label={list.label[lang]} announceSelection={false} messages={messages}
                  value={selected} onChange={next => write(list.key, next)} groups={[{ id: list.id, label: list.label[lang], items: groupOptions.map(option => ({ id: option.value, label: option.label[lang], disabledReason: category.disabled?.reason[lang] ?? option.disabledReason?.[lang] })) }]} />;
              })}
            </div>
          </section>)}
          {state.status === 'ready' && groups.every(group => Object.values(group.lists).every(options => options.length === 0)) && emptyOptions()}
          {kind.lists.map(list => <div key={list.id}>{unknown(list.key, groups.flatMap(group => group.lists[list.id] ?? []))}</div>)}
        </div>;
      }
    }
  }
  let selectionSummary: string | null = null;
  if (repeated) selectionSummary = explicitEmpty ? m('explicitEmpty') : count === 0 ? m('unconstrained') : m('selected', { count });
  // The fieldset keeps native disabled semantics for every nested control; its legend is the accessible name and the visible label sits in the same row as the count and 지우기.
  return <fieldset data-page-condition={category.id} disabled={disabled} aria-describedby={reasonsId} className="min-w-0 space-y-2 border-b border-border-subtle pb-3">
    <legend className="sr-only">{category.label[lang]}</legend>
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <span role="heading" aria-level={3} tabIndex={-1} className="text-sm font-semibold text-text-primary">{category.label[lang]}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">{selectionSummary}</span>
        <Button type="button" variant="ghost" size="toolbar" disabled={disabled || (Object.keys(owned).length === 0 && raw.length === 0)} aria-label={m('clearOne', { label: category.label[lang] })} aria-describedby={reasonsId} onClick={() => change(null)}>{m('clear')}</Button>
      </span>
    </div>
    <div id={reasonsId} className="space-y-1 text-xs text-text-secondary">{description.filter(Boolean).map((reason, index) => <p key={index}>{reason}</p>)}
      {localIssues.length > 0 && raw.map(([, value], index) => <p key={`raw:${index}`}>{m('retained', { value })}</p>)}
    </div>
    {controls()}
    {state.status === 'ready' && 'options' in state.data && state.data.truncated && <p className="text-xs text-text-warning-label">{m('partial')}</p>}
  </fieldset>;
}

/** Free text commits on blur or Enter, never per keystroke: a live menu would otherwise push the URL and refetch for every character. */
function CommitInput({ value, onCommit, ...props }: {
  value: string; onCommit: (text: string) => void; id?: string; 'aria-label'?: string; disabled?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean;
}) {
  const [draft, setDraft] = useState({ source: value, text: value });
  if (draft.source !== value) setDraft({ source: value, text: value });
  const ime = useImeEnterGuard();
  const commit = () => { if (draft.text !== value) onCommit(draft.text); };
  return <Input type="search" {...props} value={draft.text} onChange={event => { const text = event.target.value; setDraft({ source: value, text }); if (text === '' && value !== '') onCommit(''); }} onBlur={commit}
    onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd} onKeyDown={event => { if (ime.isComposingEnter(event)) return; if (event.key === 'Enter') { event.preventDefault(); commit(); } }} />;
}

type BoundField = { label: string; value: string; inputMode?: 'decimal'; type?: 'text' | 'datetime-local'; step?: number };
/** Preserve both draft bounds together so correcting one side never drops an invalid or raw sibling. */
function BoundInputs({ fields, onCommit, columns = 'stack', ...props }: {
  fields: readonly BoundField[]; onCommit: (texts: readonly string[]) => void; columns?: 'pair' | 'stack';
  disabled?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean;
}) {
  const prefix = useId();
  const source = JSON.stringify(fields.map(field => field.value));
  const [draft, setDraft] = useState({ source, texts: fields.map(field => field.value) });
  if (draft.source !== source) setDraft({ source, texts: fields.map(field => field.value) });
  return <div className={columns === 'pair' ? 'grid min-w-0 grid-cols-2 gap-2' : 'grid min-w-0 gap-2'}>
    {fields.map((field, index) => <div key={index} className="grid min-w-0 gap-1">
      <Label htmlFor={`${prefix}-${index}`}>{field.label}</Label>
      <Input id={`${prefix}-${index}`} type={field.type} step={field.step} inputMode={field.inputMode} {...props} value={draft.texts[index]}
        onChange={event => setDraft({ source, texts: draft.texts.map((text, i) => i === index ? event.target.value : text) })} onBlur={() => { if (JSON.stringify(draft.texts) !== source) onCommit(draft.texts); }} />
    </div>)}
  </div>;
}
function onStep(value: number, origin: number, step: number): boolean {
  const quotient = (value - origin) / step;
  const ROUNDING_TOLERANCE = 1e-9;
  return Math.abs(quotient - Math.round(quotient)) <= ROUNDING_TOLERANCE;
}
