import { X } from 'lucide-react';
import { useContext } from 'react';
import type * as React from 'react';
import { StatusBadgeFrame } from '../badges/StatusBadgeFrame.js';
import { Button } from '../components/Button.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/shadcn/tooltip.js';
import { cn } from '../utils/cn.js';
import {
  DetailPanelFullscreenContext,
  DetailPanelFullscreenToggle,
  rememberDetailCloseTooltipEscape,
} from './DetailPanelFullscreenContext.js';

// Labels and accents follow DETAIL_PANEL_KINDS in docs/design-prototype/panel.jsx.
export type DetailPanelKind =
  | 'voc'
  | 'finding'
  | 'task_request'
  | 'task'
  | 'milestone'
  | 'survey'
  | 'cluster';

export interface DetailPanelHeaderProps {
  /** @deprecated Supply label and accent; removed next SDK minor. */
  kind?: DetailPanelKind;
  label?: string;
  /** Consumer-owned semantic marker, independent of the deprecated kind prop. */
  'data-kind'?: string;
  /** Badge-only chrome preserves the compact presentation without a domain kind. */
  appearance?: 'stripe' | 'badge';
  accent?: 'voc' | 'success' | 'warn' | 'task' | 'info';
  /**
   * Display id. Omit while the record is pending/denied/unavailable so the
   * header chrome (and its close action) still mounts without showing any
   * unavailable record data.
   */
  id?: string | undefined;
  title?: React.ReactNode;
  /** Maximum title lines. Defaults to one line in a fixed-height toolbar. */
  titleLines?: 1 | 2;
  /** ID of the visible title heading, or the record ID heading when there is no title. */
  headingId?: string;
  metadata?: React.ReactNode;
  onClose?: () => void;
  closeRef?: React.Ref<HTMLButtonElement>;
  closeLabel?: string;
  expandLabel?: string;
  collapseLabel?: string;
  showExpand?: boolean;
  extras?: React.ReactNode;
  className?: string;
}

/** @deprecated Consumer-owned labels replace this map next SDK minor. */
const KIND_LABELS: Record<DetailPanelKind, string> = {
  voc: 'VOC',
  finding: 'Finding',
  task_request: 'Task 요청',
  task: 'Task',
  survey: '설문',
  cluster: '반복 VOC',
  milestone: 'Milestone',
};

type KindAccent = { token: string; bgClass: string; textClass: string };

const KIND_ACCENT = {
  voc: { token: '--color-aether-blue', bgClass: 'bg-accent-voc', textClass: 'text-accent-voc' },
  finding: {
    token: '--color-emerald',
    bgClass: 'bg-accent-success',
    textClass: 'text-accent-success',
  },
  task_request: {
    token: '--color-amber',
    bgClass: 'bg-accent-warn',
    textClass: 'text-accent-warn',
  },
  task: { token: '--color-amethyst', bgClass: 'bg-accent-task', textClass: 'text-accent-task' },
  survey: {
    token: '--color-cyan-spark',
    bgClass: 'bg-accent-info',
    textClass: 'text-accent-info',
  },
  cluster: { token: '--color-amber', bgClass: 'bg-accent-warn', textClass: 'text-accent-warn' },
  milestone: {
    token: '--color-amber',
    bgClass: 'bg-accent-warn',
    textClass: 'text-accent-warn',
  },
} satisfies Record<DetailPanelKind, KindAccent>;

export function DetailPanelHeader({
  kind,
  'data-kind': dataKind,
  label,
  appearance,
  accent: suppliedAccent,
  id,
  title,
  titleLines = 1,
  headingId,
  metadata,
  onClose,
  closeRef,
  closeLabel = '패널 닫기',
  expandLabel,
  collapseLabel,
  showExpand = true,
  extras,
  className,
}: DetailPanelHeaderProps) {
  const isMilestone = appearance === 'badge' || (appearance === undefined && kind === 'milestone');
  const accentKind = { voc: 'voc', success: 'finding', warn: 'task_request', task: 'task', info: 'survey' } as const;
  const accent = suppliedAccent ? KIND_ACCENT[accentKind[suppliedAccent]] : KIND_ACCENT[kind ?? 'voc'];
  const kicker = label ?? (kind ? KIND_LABELS[kind] : undefined);
  const hasFullscreenToggle = useContext(DetailPanelFullscreenContext) !== null;
  const showActions = (showExpand && hasFullscreenToggle) || onClose !== undefined;
  const hasKind = kicker !== undefined || dataKind !== undefined;
  const wrapsTitle = titleLines === 2;
  // Keep numeric tokens like 11-04 together while allowing wraps between words.
  // Only plain text gets the ellipsis wrapper; consumer nodes (such as a Fragment of blocks) stay direct flex children.
  const metadataContent = typeof metadata === 'string'
    ? metadata !== '' && (
      <div className="min-w-0 overflow-hidden text-ellipsis">
        {metadata.split(/(\s+)/u).map((word, index) => (
          /\d[-/]\d/u.test(word) ? <span key={index} className="whitespace-nowrap">{word}</span> : word
        ))}
      </div>
    )
    : metadata;
  const kickerBadge = kicker !== undefined && <StatusBadgeFrame
    appearance="compact"
    textClassName={accent.textClass}
    tintClassName="bg-(--detail-panel-kind-tint)"
    className="leading-none tracking-kind-label"
    indicator={
      <span
        aria-hidden="true"
        className={cn('h-1.5 w-1.5 shrink-0 rounded-(--radius-pill)', accent.bgClass)}
      />
    }
  >
    {kicker}
  </StatusBadgeFrame>;

  return (
    <header
      data-kind={dataKind ?? kind}
      style={
        {
          // eslint-disable-next-line shadcn/no-inline-styles -- exact 0.12 kind tint is asserted by the milestones visual spec
          '--detail-panel-kind-tint': `rgb(var(${accent.token}) / 0.12)`,
        } as React.CSSProperties
      }
      className={cn(
        'sticky top-0 z-10 bg-surface-card border-b border-border-subtle',
        wrapsTitle ? 'flex shrink-0 items-stretch min-h-toolbar' : 'flex shrink-0 items-stretch h-toolbar',
        className,
      )}
    >
      {hasKind && !isMilestone && <div aria-hidden="true" className={cn('w-1 shrink-0', accent.bgClass)} />}

      {/* Content row */}
      <div
        data-testid="detail-panel-header-content"
        className={cn('flex flex-1 items-center gap-3 pr-3 min-w-0', isMilestone || !hasKind ? 'pl-5' : 'pl-4', wrapsTitle && 'py-1')}
      >
        <div className={cn('flex min-w-0 flex-1 break-keep wrap-normal', wrapsTitle ? 'flex-col items-start gap-0.5' : 'items-baseline gap-2')}>
          <div className={cn('flex min-w-0 max-w-full', wrapsTitle ? 'items-center' : 'items-baseline', 'gap-2')}>
            {id !== undefined && (title == null
              ? <h2 id={headingId} className="t-mono truncate font-mono text-xs text-text-muted leading-none">{id}</h2>
              : <span className="t-mono max-w-1/2 shrink-0 truncate font-mono text-xs text-text-muted leading-none">{id}</span>)}
            {title != null && <h2 id={headingId} className={cn('t-section-title min-w-0 break-keep', wrapsTitle ? 'line-clamp-2 wrap-anywhere' : 'truncate')}>{title}</h2>}
          </div>
          {wrapsTitle
            ? (kicker !== undefined || (metadataContent != null && metadataContent !== false)) && <div className="flex min-w-0 max-w-full items-center gap-2">{kickerBadge}{metadataContent}</div>
            : <>{kickerBadge}{metadataContent}</>}
        </div>

        {/* Extras slot */}
        {(showActions || extras != null) && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {extras}
            {showExpand && <DetailPanelFullscreenToggle
              {...(expandLabel !== undefined ? { expandLabel } : {})}
              {...(collapseLabel !== undefined ? { collapseLabel } : {})} />}
            {onClose && (
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button ref={closeRef} type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={closeLabel}
                  data-detail-panel-close
                  onFocus={event => { if (event.currentTarget.hasAttribute('data-detail-initial-focus')) event.preventDefault(); }}>
                  <X className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger><TooltipContent onEscapeKeyDown={rememberDetailCloseTooltipEscape}>{closeLabel}</TooltipContent></Tooltip></TooltipProvider>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
