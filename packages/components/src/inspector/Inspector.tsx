import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { useI18n, usePlatformOptional, type Text } from '@ap/kernel';
import {
  Button, cn, isProductionEnv,
  Popover, PopoverContent, PopoverTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@ap/ui';
import type { LucideIcon } from 'lucide-react';
import { INSPECTOR_ID, inspectorStorageKey, normalizeExpanded, readExpanded, writeExpanded } from './inspectorState';

/** One auxiliary section. `render` is the caller's content; the Inspector never reads data for it (see {@link Inspector}). */
export type InspectorSection = {
  /** Static id (`/^[a-z][a-z0-9._-]{0,63}$/`), unique in the list; it is what `expanded` and the stored preference hold. */
  id: string;
  title: Text;
  /** Shown on the `rail` button. */
  icon: LucideIcon;
  /** One line shown in the header of a collapsed `stack` section (ellipsis plus `title` attribute when it does not fit). */
  summary?: Text;
  render: () => ReactNode;
};

export type InspectorProps = {
  sections: readonly InspectorSection[];
  form: 'stack' | 'rail';
  /** Accessible name of the inspector. */
  label: Text;
  /** Remembers the expanded set of an uncontrolled `stack` (`platform:inspector-expanded:v1:<user>:<menu>:<persistKey>`). A static id; an invalid one is not stored. Without a user or a routed menu the set stays in memory. */
  persistKey?: string;
  /** Optional controlled expanded set. While given, the Inspector neither keeps nor stores its own. */
  expanded?: readonly string[];
  onExpandedChange?: (ids: string[]) => void;
  /** Uncontrolled default when nothing is stored; omitted = all expanded. */
  defaultExpanded?: readonly string[];
};

/** Development-only diagnostics; production renders on and treats an invalid `persistKey` as absent. */
function useDevChecks({ sections, persistKey }: InspectorProps) {
  const signature = JSON.stringify([sections.map(section => section.id), persistKey]);
  useEffect(() => {
    if (isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) return;
    const problems: string[] = [];
    if (persistKey !== undefined && !INSPECTOR_ID.test(persistKey)) problems.push(`persistKey "${persistKey}" must match ${String(INSPECTOR_ID)}`);
    for (const section of sections) if (!INSPECTOR_ID.test(section.id)) problems.push(`section id "${section.id}" must match ${String(INSPECTOR_ID)}`);
    if (new Set(sections.map(section => section.id)).size !== sections.length) problems.push('section ids must be unique');
    if (problems.length > 0) console.error(`[Inspector] ${problems.join('; ')}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` serialises exactly the inputs read above
  }, [signature]);
}

/**
 * **Candidate**: auxiliary settings of an analysis screen (target, legend, options), declared once as `sections` and shown in one of two
 * forms. `stack` is an APG accordion (heading > button with `aria-expanded`/`aria-controls`; several sections open at once by default;
 * the whole stack scrolls, sections do not). `rail` is a 40 px icon column; a click or Enter opens one section in a non-modal Popover peek
 * (Escape closes it and returns focus to its button; one peek at a time). References: WAI-ARIA APG Accordion, Carbon accordion (06 §13,
 * ADR-0080).
 *
 * - **Section content never owns queries.** `render` is called by the Inspector, but data reading stays above it: keep queries in the
 *   menu and pass results into `render`. Toggling a section or a peek, and switching `form`, never re-run anything outside the
 *   rendered sections. In `stack` every section stays mounted (a collapsed one is `hidden`), so toggling remounts nothing. In `rail`
 *   only the peeked section is mounted, and switching `form` remounts the section contents (their state resets; caller queries do not).
 * - **Persist.** An uncontrolled Inspector with a valid `persistKey` stores its expanded set per user and menu (a user or menu change
 *   restores that identity's set). The `rail` form has no expanded set.
 */
export function Inspector(props: InspectorProps) {
  useDevChecks(props);
  const { tx } = useI18n();
  const known = props.sections.map(section => section.id);
  const platform = usePlatformOptional();
  const userId = platform?.session.user.id;
  const menuId = platform?.route?.menu.id;
  // A persistKey (or menu, or user) change is a different preference: the body remounts and restores that identity's set.
  const storeKey = props.persistKey !== undefined && INSPECTOR_ID.test(props.persistKey) && userId && menuId ? inspectorStorageKey(userId, menuId, props.persistKey) : null;
  return <TooltipProvider delayDuration={200}>
    {props.form === 'stack'
      ? <InspectorStack key={`stack:${storeKey ?? ''}`} {...props} label={tx(props.label)} known={known} storeKey={storeKey} />
      : <InspectorRail key="rail" {...props} label={tx(props.label)} />}
  </TooltipProvider>;
}

type Shared = { sections: readonly InspectorSection[]; label: string };

function InspectorStack({ sections, label, known, storeKey, expanded: controlled, onExpandedChange, defaultExpanded }: Shared & Pick<InspectorProps, 'expanded' | 'onExpandedChange' | 'defaultExpanded'> & { known: readonly string[]; storeKey: string | null }) {
  const { tx } = useI18n();
  const base = useId().replaceAll(':', '');
  const [own, setOwn] = useState<string[]>(() => (storeKey && controlled === undefined ? readExpanded(storeKey, known) : null) ?? normalizeExpanded(defaultExpanded ?? known, known));
  const open = controlled === undefined ? own : normalizeExpanded(controlled, known);
  const toggle = useCallback((id: string) => {
    const wanted = open.includes(id) ? open.filter(item => item !== id) : [...open, id];
    const next = normalizeExpanded(wanted, known);
    if (controlled === undefined) {
      setOwn(next);
      if (storeKey) writeExpanded(storeKey, next);
    }
    onExpandedChange?.(next);
  }, [open, known, controlled, storeKey, onExpandedChange]);

  return <div role="group" aria-label={label} className="h-full min-h-0 min-w-0 overflow-y-auto">
    {sections.map(section => {
      const isOpen = open.includes(section.id);
      const titleId = `${base}-${section.id}-title`;
      const summaryId = `${base}-${section.id}-summary`;
      const panelId = `${base}-${section.id}-panel`;
      const summary = section.summary ? tx(section.summary) : null;
      return <section key={section.id} className="border-b border-border-subtle">
        <h3 className="m-0 text-sm font-semibold">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-labelledby={titleId}
            aria-describedby={!isOpen && summary ? summaryId : undefined}
            onClick={() => toggle(section.id)}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <ChevronDown aria-hidden className={cn('size-4 shrink-0 transition-transform', !isOpen && '-rotate-90')} />
            <span id={titleId} className="shrink-0 whitespace-nowrap">{tx(section.title)}</span>
            {!isOpen && summary && <span id={summaryId} title={summary} className="min-w-0 flex-1 truncate text-tiny font-normal text-text-muted">{summary}</span>}
          </button>
        </h3>
        <div id={panelId} hidden={!isOpen} className="px-2 pb-3">{section.render()}</div>
      </section>;
    })}
  </div>;
}

/** Stable type, so Popover mounts the caller's `render` only while its peek is open (a closed section's callback is never called). */
function SectionContent({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

function InspectorRail({ sections, label }: Shared) {
  const { tx } = useI18n();
  const [peek, setPeek] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null); // the tooltip stays shut while its section's peek is open
  return <div role="group" aria-label={label} className="flex h-full w-10 shrink-0 flex-col items-center gap-1 py-1">
    {sections.map(section => {
      const Icon = section.icon;
      const title = tx(section.title);
      const isOpen = peek === section.id;
      return <Popover key={section.id} open={isOpen} onOpenChange={next => setPeek(next ? section.id : null)}>
        <Tooltip open={tip === section.id && !isOpen} onOpenChange={next => setTip(current => next ? section.id : current === section.id ? null : current)}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button type="button" variant={isOpen ? 'secondary' : 'ghost'} size="icon-sm" aria-label={title} className="relative">
                {isOpen && <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent-primary" />}
                <Icon aria-hidden className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{title}</TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" aria-label={title} className="max-h-[70vh] w-80 overflow-y-auto"><SectionContent render={section.render} /></PopoverContent>
      </Popover>;
    })}
  </div>;
}
