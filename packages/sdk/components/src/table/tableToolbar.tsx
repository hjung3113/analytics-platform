/**
 * Pieces of the one-line toolbar of PlatformDataTable (06 §15, node 1217c): the title with its ⓘ description tooltip, the 「그룹: 없음 ▾」
 * menu (replaces the native select), the `⋯` overflow menu and the width rule that decides what moves into it.
 * Internal module: not exported from `index.ts`.
 */
import { type ReactNode, type Ref } from 'react';
import { ChevronDown, Info, MoreHorizontal } from 'lucide-react';
import { useI18n, useMessages, type Lang } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import { TABLE_SIZES, parseTableSize, type TableSize } from './tableSize';
import {
  Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@ap/ui';
/** The toolbar controls that can move into `⋯`, in the order they leave the bar as the toolbar narrows (the menu lists them in toolbar order). 표 크기 (1217d) leaves right after 그룹: both change what the rows show and sit side by side. */
export const COLLAPSE_ORDER = ['copy', 'group', 'size', 'columns', 'export'] as const;
export type Collapsible = typeof COLLAPSE_ORDER[number];
/** Toolbar width (px) below which the control at the same index of COLLAPSE_ORDER is in `⋯`: wide panes keep everything, a 220px board cell keeps only the title and `⋯`. */
export const COLLAPSE_BELOW: Record<Collapsible, number> = { copy: 640, group: 520, size: 470, columns: 420, export: 300 };

/** What is in `⋯` at this toolbar width; an unmeasured width (null) collapses nothing. */
export function collapsedControls(width: number | null): ReadonlySet<Collapsible> {
  if (width === null || width <= 0) return new Set();
  return new Set(COLLAPSE_ORDER.filter(key => width < COLLAPSE_BELOW[key]));
}

/** Title and description remain linked in every context. A hidden page title moves its description to the merged result summary. */
export function ToolbarTitle({ title, subtitle, srOnly, lang, descriptionId }: { title: ReactNode; subtitle?: ReactNode; srOnly: boolean; lang: Lang; descriptionId?: string }) {
  return <div className={cn('flex min-w-0 items-center gap-1', srOnly && !subtitle && 'sr-only')}>
    <h2 className={cn('t-card-title min-w-0 truncate', srOnly && 'sr-only')} title={typeof title === 'string' ? title : undefined}>{title}</h2>
    <ToolbarDescription subtitle={subtitle} lang={lang} descriptionId={descriptionId} />
  </div>;
}

/** The same tooltip and accessible description beside either the title or the merged result count. */
export function ToolbarDescription({ subtitle, descriptionId }: { subtitle?: ReactNode; lang: Lang; descriptionId?: string }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  if (!subtitle) return null;
  return <>
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" data-table-description aria-describedby={descriptionId} aria-label={m('tableDescription')}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-text-muted hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
            <Info className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent portal size="sm" className="max-w-72">{subtitle}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    {/* One persistent description for both the section and the ⓘ; the portaled tooltip shows the same text. */}
    <p id={descriptionId} className="sr-only">{subtitle}</p>
  </>;
}

type GroupOption = { id: string; header: string };

function useGroupLabel(value: string, options: GroupOption[]) {
  const { t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const chosen = options.find(o => o.id === value)?.header ?? t('none');
  return `${m('tableGroupBy')}: ${chosen}`;
}

function GroupRadios({ value, options, onChange }: { value: string; options: GroupOption[]; onChange: (id: string) => void }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
    <DropdownMenuRadioItem value="">{m('tableNoGrouping')}</DropdownMenuRadioItem>
    {options.map(o => <DropdownMenuRadioItem key={o.id} value={o.id}>{o.header}</DropdownMenuRadioItem>)}
  </DropdownMenuRadioGroup>;
}

/** 「그룹: 없음 ▾」: a 32px menu button (▾ because it picks a value) over a radio list. The server groups; this only chooses the column. */
export function GroupMenu({ value, options, onChange }: { lang: Lang; value: string; options: GroupOption[]; onChange: (id: string) => void }) {
  const label = useGroupLabel(value, options);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="secondary" size="toolbar" data-row-group-select>{label}<ChevronDown className="size-3.5" aria-hidden /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-40"><GroupRadios value={value} options={options} onChange={onChange} /></DropdownMenuContent>
  </DropdownMenu>;
}

/** The same choice inside `⋯`, as a submenu. */
export function GroupSubmenu({ value, options, onChange }: { lang: Lang; value: string; options: GroupOption[]; onChange: (id: string) => void }) {
  const label = useGroupLabel(value, options);
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger data-row-group-select>{label}</DropdownMenuSubTrigger>
    <DropdownMenuSubContent><GroupRadios value={value} options={options} onChange={onChange} /></DropdownMenuSubContent>
  </DropdownMenuSub>;
}

const SIZE_KEY = { small: 'tableSizeSmall', normal: 'tableSizeNormal', large: 'tableSizeLarge' } as const;
function SizeRadios({ value, onChange }: { value: TableSize; onChange: (size: TableSize) => void }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <DropdownMenuRadioGroup value={value} onValueChange={v => { const size = parseTableSize(v); if (size) onChange(size); }}>
    {TABLE_SIZES.map(size => <DropdownMenuRadioItem key={size} value={size}>{m(SIZE_KEY[size])}</DropdownMenuRadioItem>)}
  </DropdownMenuRadioGroup>;
}

/** 「표 크기: 보통 ▾」: a 32px menu button like 그룹 (▾ because it picks a value) over a radio list: 작게 / 보통 / 크게. One per-user setting for every table. */
export function TableSizeMenu({ value, onChange }: { lang: Lang; value: TableSize; onChange: (size: TableSize) => void }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="secondary" size="toolbar" data-table-size-select>{m('tableSizeLabel')}: {m(SIZE_KEY[value])}<ChevronDown className="size-3.5" aria-hidden /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-40"><SizeRadios value={value} onChange={onChange} /></DropdownMenuContent>
  </DropdownMenu>;
}

/** The same choice inside `⋯`, as a submenu. */
export function TableSizeSubmenu({ value, onChange }: { lang: Lang; value: TableSize; onChange: (size: TableSize) => void }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger data-table-size-select>{m('tableSizeLabel')}: {m(SIZE_KEY[value])}</DropdownMenuSubTrigger>
    <DropdownMenuSubContent><SizeRadios value={value} onChange={onChange} /></DropdownMenuSubContent>
  </DropdownMenuSub>;
}

/** `⋯`: the controls that no longer fit, as menu items in toolbar order. Rendered only when something collapsed. */
export function MoreMenu({ children, onCloseAutoFocus, triggerRef }: { lang: Lang; children: ReactNode; onCloseAutoFocus?: (event: Event) => void; triggerRef?: Ref<HTMLButtonElement> }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button ref={triggerRef} variant="secondary" size="toolbar" data-table-more aria-label={m('tableMore')}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-48" onCloseAutoFocus={onCloseAutoFocus}>{children}</DropdownMenuContent>
  </DropdownMenu>;
}
