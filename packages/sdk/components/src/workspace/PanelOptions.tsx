import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, cn } from '@ap/ui';
import { useI18n, useMessages, usePlatform, type Text } from '@ap/kernel';
import { SegmentedRadio } from '../RadioGroup';
import type { PageKeyRule } from '../table/tableUrlWarning';
import { COMPONENTS_MESSAGES } from '../messages';

/** One value of a `choice` option. `chip` is the header chip text when this value is set (default: `label`). */
export type PanelOptionChoice = { value: string; label: Text; chip?: Text };

/**
 * A per-panel display option the menu declares (#2396, #2391). The SDK draws it and keeps its state in the menu's own page key; the menu owns
 * what the option means. `pageKey` follows the kernel identifier rule (`/^[a-z][a-zA-Z0-9]*$/`, no dots) and must be one of the menu's
 * `pageKeys` (usually also `hiddenPageKeys`). The default value is the key's absence.
 * - `choice`: two values draw a two-cell switch, three or more a menu. `default` is one of the `choices` values.
 * - `toggle`: off by default; on is stored as `1`. The control says its state in words (`on` / `off`).
 * `hidden: true` keeps the option out of the toolbar and the chips (for example at a drill step where it does not apply); its key is kept.
 */
export type PanelOption =
  | { id: string; kind: 'choice'; pageKey: string; label: Text; choices: readonly PanelOptionChoice[]; default: string; hidden?: boolean }
  | { id: string; kind: 'toggle'; pageKey: string; label: Text; on: Text; off: Text; chip?: Text; hidden?: boolean };

/** Current value per option id: the choice value, or `true`/`false` for a toggle. */
export type PanelOptionValues = Readonly<Record<string, string | boolean>>;

const TOGGLE_ON = '1';

const defaultOf = (option: PanelOption) => option.kind === 'choice' ? option.default : false;
const isValidRaw = (option: PanelOption, raw: string) => option.kind === 'choice' ? option.choices.some(choice => choice.value === raw) : raw === TOGGLE_ON;
const valueOfRaw = (option: PanelOption, raw: string | null): string | boolean => {
  if (raw === null || !isValidRaw(option, raw)) return defaultOf(option);
  return option.kind === 'choice' ? raw : true;
};

/** Options whose current value differs from the default and that are not hidden, in declaration order. */
export function changedPanelOptions(options: readonly PanelOption[], values: PanelOptionValues): PanelOption[] {
  return options.filter(option => !option.hidden && option.id in values && values[option.id] !== defaultOf(option));
}

/**
 * Reads and writes declared panel options through page keys (#2396). A missing or malformed key reads as the default (the menu rejects
 * malformed keys with `usePageKeyRules(rules)`; this hook never rewrites them). Writing the default clears the key, so links and saved views
 * carry only the settings that differ. Saved views store declared page keys (kernel §21.1), so options need no `chartOptions` entry.
 */
export function usePanelOptions(options: readonly PanelOption[]): {
  values: PanelOptionValues;
  setValue: (id: string, value: string | boolean) => void;
  reset: (id: string) => void;
  rules: PageKeyRule[];
} {
  const { pageParam, setPage } = usePlatform();
  const raws = options.map(option => pageParam(option.pageKey));
  const rawKey = JSON.stringify(raws);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `rawKey` is the value identity of `raws`
  const values = useMemo(() => Object.fromEntries(options.map((option, index) => [option.id, valueOfRaw(option, raws[index] ?? null)])), [options, rawKey]);
  const setValue = useCallback((id: string, value: string | boolean) => {
    const option = options.find(item => item.id === id);
    if (!option) return;
    const encoded = value === defaultOf(option) ? null : option.kind === 'toggle' ? (value ? TOGGLE_ON : null) : String(value);
    setPage({ [option.pageKey]: encoded });
  }, [options, setPage]);
  const reset = useCallback((id: string) => {
    const option = options.find(item => item.id === id);
    if (option) setPage({ [option.pageKey]: null });
  }, [options, setPage]);
  const rules = useMemo(() => options.map(option => ({ key: option.pageKey, label: option.label, valid: (raw: string) => isValidRaw(option, raw) })), [options]);
  return { values, setValue, reset, rules };
}

/** Default width (px) of the surrounding panel below which the options fold into one «보기 ▾» menu. */
export const PANEL_OPTIONS_COLLAPSE_BELOW = 480;

/** Width of the nearest panel (`[data-dock-panel]`) or region (`section`) around `node`, else its parent; kept current by a ResizeObserver. */
function useScopeWidth(enabled: boolean) {
  const anchor = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = anchor.current;
    if (!enabled || !node) return;
    const scope = node.closest<HTMLElement>('[data-dock-panel], section') ?? node.parentElement;
    if (!scope) return;
    if (typeof ResizeObserver === 'undefined') { setWidth(scope.getBoundingClientRect().width); return; }
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) setWidth(entry.contentRect.width); });
    observer.observe(scope);
    return () => { observer.disconnect(); };
  }, [enabled]);
  return { anchor, width };
}

export type PanelOptionsProps = {
  options: readonly PanelOption[];
  values: PanelOptionValues;
  onChange: (id: string, value: string | boolean) => void;
  /** Force the folded (`true`) or inline (`false`) form. Without it the form follows the surrounding panel's width against `collapseBelow`. */
  collapsed?: boolean;
  /** Panel width in px below which the options fold. Default `PANEL_OPTIONS_COLLAPSE_BELOW`. */
  collapseBelow?: number;
  className?: string;
};

/**
 * Declared panel options drawn inline in a panel toolbar (for example a chart frame's `extraActions`), folding into «보기 ▾» when the panel is
 * narrow (#2396, layout §12.8). Controlled: pair it with `usePanelOptions`. Hidden options are not drawn.
 */
export function PanelOptions({ options, values, onChange, collapsed, collapseBelow = PANEL_OPTIONS_COLLAPSE_BELOW, className }: PanelOptionsProps) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { lang } = useI18n();
  const shown = options.filter(option => !option.hidden);
  const { anchor, width } = useScopeWidth(collapsed === undefined);
  if (shown.length === 0) return null;
  const folded = collapsed ?? (width !== null && width < collapseBelow);
  const valueOf = (option: PanelOption) => values[option.id] ?? defaultOf(option);
  if (folded) {
    return <div ref={anchor} data-panel-options="folded" className={cn('flex items-center', className)}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="toolbar">{m('panelOptionsView')}<ChevronDown className="size-3.5" aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {shown.map((option, index) => <div key={option.id} role="group" aria-label={option.label[lang]}>
            {index > 0 && <DropdownMenuSeparator />}
            {option.kind === 'choice'
              ? <>
                <DropdownMenuLabel>{option.label[lang]}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={String(valueOf(option))} onValueChange={next => onChange(option.id, next)}>
                  {option.choices.map(choice => <DropdownMenuRadioItem key={choice.value} value={choice.value}>{choice.label[lang]}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </>
              : <DropdownMenuCheckboxItem checked={valueOf(option) === true} onCheckedChange={checked => onChange(option.id, checked === true)}>
                {option.label[lang]}
              </DropdownMenuCheckboxItem>}
          </div>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>;
  }
  return <div ref={anchor} data-panel-options="inline" className={cn('flex flex-wrap items-center gap-1', className)}>
    {shown.map(option => {
      const label = option.label[lang];
      if (option.kind === 'toggle') {
        const on = valueOf(option) === true;
        return <Button key={option.id} type="button" variant={on ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={on} onClick={() => onChange(option.id, !on)}>
          {label}: {on ? option.on[lang] : option.off[lang]}
        </Button>;
      }
      const value = String(valueOf(option));
      if (option.choices.length === 2) {
        return <SegmentedRadio key={option.id} label={label} value={value} onChange={next => onChange(option.id, next)}
          options={option.choices.map(choice => ({ value: choice.value, label: choice.label[lang] }))} />;
      }
      const current = option.choices.find(choice => choice.value === value);
      return <DropdownMenu key={option.id} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="toolbar">{label}: {current?.label[lang] ?? value}<ChevronDown className="size-3.5" aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value} onValueChange={next => onChange(option.id, next)}>
            {option.choices.map(choice => <DropdownMenuRadioItem key={choice.value} value={choice.value}>{choice.label[lang]}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>;
    })}
  </div>;
}

export type PanelOptionChipsProps = {
  options: readonly PanelOption[];
  values: PanelOptionValues;
  /** The chip's × returns that option to its default (with `usePanelOptions`, pass its `reset`). */
  onReset: (id: string) => void;
  className?: string;
};

/** One chip per non-default, non-hidden option for the panel header («합 큰 순 ×», #2396). Renders nothing when every option is at its default. */
export function PanelOptionChips({ options, values, onReset, className }: PanelOptionChipsProps) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { lang } = useI18n();
  const changed = changedPanelOptions(options, values);
  if (changed.length === 0) return null;
  return <ul aria-label={m('panelOptionsChanged')} data-panel-option-chips="" className={cn('flex flex-wrap items-center gap-1', className)}>
    {changed.map(option => {
      const text = option.kind === 'toggle'
        ? (option.chip ?? option.label)[lang]
        : (() => { const choice = option.choices.find(item => item.value === values[option.id]); return (choice?.chip ?? choice?.label)?.[lang] ?? String(values[option.id]); })();
      return <li key={option.id} className="inline-flex items-center gap-0.5 rounded-full border border-border-subtle bg-surface-sunken ps-2 text-xs text-text-secondary">
        <span>{text}</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={m('panelOptionsResetOne', { label: option.label[lang], value: text })}
          onClick={() => onReset(option.id)}><X className="size-3" aria-hidden /></Button>
      </li>;
    })}
  </ul>;
}
