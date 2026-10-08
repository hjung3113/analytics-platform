import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { PlatformLink, useDrill, useI18n, usePlatform } from '@ap/kernel';
import {
  Button, cn,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@ap/ui';
import { StateMessage } from './StateView';

/** One sibling choice. `hint` is already display text; this layer does not know the domain. */
export type DrillSibling = { value: string; hint?: string };
/** Sibling lists keyed by drill level. Omit a key, or pass an empty list, to hide its menu. */
export type DrillSiblings = Readonly<Record<string, readonly DrillSibling[]>>;

export type DrillPathProps = { siblings?: DrillSiblings };
export type DrillLayoutProps = DrillPathProps & {
  /** A step value the query recognized as absent. Ignored while `useDrill().invalid` is set. */
  notFound?: { key: string; value: string };
  children?: ReactNode;
};

const focusRing = 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';

function SiblingMenu({ label, value, items, onSwitch }: {
  label: string; value: string; items: readonly DrillSibling[]; onSwitch: (value: string) => void;
}) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={ko ? `${label} 바꾸기` : `Change ${label}`}
        className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuRadioGroup value={value} onValueChange={onSwitch}>
        {items.map(item => <DropdownMenuRadioItem key={item.value} value={item.value} className={focusRing}>
          <span className="t-mono">{item.value}</span>
          {item.hint !== undefined && <span className="ml-2 text-text-secondary tabular">{item.hint}</span>}
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

/**
 * Path bar for the current menu's drill (06 §12.7, ADR-0025). Nothing at depth 0.
 * Five chips (depth 4) collapse to All, a middle-step menu, and the last two chips.
 */
export function DrillPath({ siblings }: DrillPathProps) {
  const drill = useDrill();
  const { lang, tx } = useI18n();
  const ko = lang === 'ko';
  if (drill.depth === 0) return null;

  const collapsed = drill.trail.length === 4;
  const hidden = collapsed ? drill.trail.slice(0, drill.trail.length - 2) : [];
  const visible = collapsed ? drill.trail.slice(drill.trail.length - 2) : drill.trail;

  const chipFor = (index: number) => {
    const step = drill.trail[index];
    if (!step) return null;
    const name = tx(step.label);
    const options = siblings?.[step.key];
    const current = index === drill.depth - 1;
    return <span key={step.key} className="inline-flex items-center">
      <button type="button" aria-current={current ? 'step' : undefined} onClick={() => drill.goTo(index + 1)}
        className={cn('rounded-md px-2 py-1', current ? 'bg-accent-primary-soft font-medium text-text-primary' : 'text-text-secondary hover:bg-surface-sunken')}>
        {name}: {step.value}
      </button>
      {options && options.length > 0 && <SiblingMenu label={name} value={step.value} items={options} onSwitch={value => drill.enter(step.key, value)} />}
    </span>;
  };

  return <nav aria-label={ko ? '드릴 경로' : 'Drill path'} className="flex flex-wrap items-center gap-1 text-xs">
    <button type="button" onClick={() => drill.goTo(0)} className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface-sunken">{ko ? '전체' : 'All'}</button>
    {hidden.length > 0 && <>
      <ChevronRight className="size-3 text-text-muted" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={ko ? '가운데 단계' : 'Middle steps'} className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface-sunken">…</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {hidden.map((step, index) => <DropdownMenuItem key={step.key} className={focusRing} onSelect={() => drill.goTo(index + 1)}>
            {tx(step.label)}: {step.value}
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </>}
    {visible.map(step => {
      const index = drill.trail.indexOf(step);
      return <span key={step.key} className="inline-flex items-center">
        <ChevronRight className="size-3 text-text-muted" aria-hidden />
        {chipFor(index)}
      </span>;
    })}
  </nav>;
}

/** Path bar, then the current step's body. A format error or a missing value replaces the body and substitutes nothing. */
export function DrillLayout({ siblings, notFound, children }: DrillLayoutProps) {
  const { invalid } = useDrill();
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const body = invalid
    ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />}
      title={ko ? `${invalid.key}=${invalid.value}는 앞 단계 없이 쓸 수 없습니다` : `${invalid.key}=${invalid.value} cannot be used without the earlier steps`}
      body={ko ? '다른 값으로 바꾸지 않습니다.' : 'Nothing was substituted.'} />
    : notFound
      ? <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />}
        title={ko ? `이 조건에서 없는 값: ${notFound.value}` : `No value in this context: ${notFound.value}`}
        body={ko ? '다른 값으로 바꾸지 않습니다.' : 'Nothing was substituted.'} />
      : children;
  return <div className="space-y-4">
    <DrillPath siblings={siblings} />
    {body}
  </div>;
}

/** Return control (06 §22). The accessible name is the visible label, trail values included. */
export function ReturnLink() {
  const { returnOrigin } = usePlatform();
  const { tx } = useI18n();
  const origin = returnOrigin();
  const trail = origin.trail.map(step => step.value).join(' › ');
  const text = trail ? `← ${tx(origin.menuLabel)} (${trail})` : `← ${tx(origin.menuLabel)}`;
  return <Button asChild variant="secondary" size="sm"><PlatformLink href={origin.href}>{text}</PlatformLink></Button>;
}
