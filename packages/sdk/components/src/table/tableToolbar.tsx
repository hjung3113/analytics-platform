/**
 * Pieces of the one-line toolbar of PlatformDataTable (06 §15, node 1217c): the title with its ⓘ description tooltip, the 「그룹: 없음 ▾」
 * menu (replaces the native select), the `⋯` overflow menu and the width rule that decides what moves into it.
 * Internal module: not exported from `index.ts`.
 */
import { type ReactNode, type Ref } from 'react';
import { ChevronDown, Info, MoreHorizontal } from 'lucide-react';
import {
  Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@ap/ui';

type Lang = 'ko' | 'en';
/** The toolbar controls that can move into `⋯`, in the order they leave the bar as the toolbar narrows (the menu lists them in toolbar order). 표 크기 (1217d) joins the end of this list. */
export const COLLAPSE_ORDER = ['copy', 'group', 'columns', 'export'] as const;
export type Collapsible = typeof COLLAPSE_ORDER[number];
/** Toolbar width (px) below which the control at the same index of COLLAPSE_ORDER is in `⋯`: wide panes keep everything, a 220px board cell keeps only the title and `⋯`. */
export const COLLAPSE_BELOW: Record<Collapsible, number> = { copy: 640, group: 520, columns: 420, export: 300 };

/** What is in `⋯` at this toolbar width; an unmeasured width (null) collapses nothing. */
export function collapsedControls(width: number | null): ReadonlySet<Collapsible> {
  if (width === null || width <= 0) return new Set();
  return new Set(COLLAPSE_ORDER.filter(key => width < COLLAPSE_BELOW[key]));
}

/** Title (truncates, full text in `title`) and, when a description exists, the ⓘ button whose tooltip carries it. `srOnly` (a panel title, #1166) hides only the title text: the ⓘ stays visible in every mode, because the description (population, basis) has no other place on screen. */
export function ToolbarTitle({ title, subtitle, srOnly, lang, descriptionId }: { title: ReactNode; subtitle?: ReactNode; srOnly: boolean; lang: Lang; descriptionId?: string }) {
  return <div className="flex min-w-0 items-center gap-1">
    <h2 className={cn('t-card-title min-w-0 truncate', srOnly && 'sr-only')} title={typeof title === 'string' ? title : undefined}>{title}</h2>
    {subtitle && <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" data-table-description aria-describedby={descriptionId} aria-label={lang === 'ko' ? '설명' : 'Description'}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-text-muted hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
            <Info className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent portal size="sm" className="max-w-72">{subtitle}</TooltipContent>
      </Tooltip>
    </TooltipProvider>}
    {/* The description stays in the DOM in every mode (visually hidden): the section's and the ⓘ's accessible description. The tooltip shows the same text. */}
    {subtitle && <p id={descriptionId} className="sr-only">{subtitle}</p>}
  </div>;
}

type GroupOption = { id: string; header: string };
const groupLabel = (lang: Lang) => lang === 'ko' ? '그룹' : 'Group by';
const noGroup = (lang: Lang) => lang === 'ko' ? '없음' : 'None';
const groupValueText = (value: string, options: GroupOption[], lang: Lang) => options.find(o => o.id === value)?.header ?? noGroup(lang);

function GroupRadios({ lang, value, options, onChange }: { lang: Lang; value: string; options: GroupOption[]; onChange: (id: string) => void }) {
  return <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
    <DropdownMenuRadioItem value="">{lang === 'ko' ? '그룹 없음' : 'No grouping'}</DropdownMenuRadioItem>
    {options.map(o => <DropdownMenuRadioItem key={o.id} value={o.id}>{o.header}</DropdownMenuRadioItem>)}
  </DropdownMenuRadioGroup>;
}

/** 「그룹: 없음 ▾」: a 32px menu button (▾ because it picks a value) over a radio list. The server groups; this only chooses the column. */
export function GroupMenu({ lang, value, options, onChange }: { lang: Lang; value: string; options: GroupOption[]; onChange: (id: string) => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="secondary" size="toolbar" data-row-group-select>{groupLabel(lang)}: {groupValueText(value, options, lang)}<ChevronDown className="size-3.5" aria-hidden /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-40"><GroupRadios lang={lang} value={value} options={options} onChange={onChange} /></DropdownMenuContent>
  </DropdownMenu>;
}

/** The same choice inside `⋯`, as a submenu. */
export function GroupSubmenu({ lang, value, options, onChange }: { lang: Lang; value: string; options: GroupOption[]; onChange: (id: string) => void }) {
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger data-row-group-select>{groupLabel(lang)}: {groupValueText(value, options, lang)}</DropdownMenuSubTrigger>
    <DropdownMenuSubContent><GroupRadios lang={lang} value={value} options={options} onChange={onChange} /></DropdownMenuSubContent>
  </DropdownMenuSub>;
}

/** `⋯`: the controls that no longer fit, as menu items in toolbar order. Rendered only when something collapsed. */
export function MoreMenu({ lang, children, onCloseAutoFocus, triggerRef }: { lang: Lang; children: ReactNode; onCloseAutoFocus?: (event: Event) => void; triggerRef?: Ref<HTMLButtonElement> }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button ref={triggerRef} variant="secondary" size="toolbar" data-table-more aria-label={lang === 'ko' ? '더보기' : 'More'}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-48" onCloseAutoFocus={onCloseAutoFocus}>{children}</DropdownMenuContent>
  </DropdownMenu>;
}
