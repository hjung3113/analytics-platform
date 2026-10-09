// THROWAWAY #250 — never merge.
import { ClipboardList, ExternalLink, ListTodo, MessageSquarePlus, MessagesSquare } from 'lucide-react';
import type { SpaceId, Text } from '@ap/contracts';
import { useI18n, usePlatform, type ProtoFeedbackOpsLink } from '@ap/kernel';
import { cn, Tooltip, TooltipContent, TooltipTrigger } from '@ap/ui';

const ITEM_ICON = {
  'voc-create': MessageSquarePlus,
  voc: MessagesSquare,
  task: ListTodo,
  survey: ClipboardList,
} as const;

export function useProtoFeedback(spaceId: SpaceId) {
  const { slots, can } = usePlatform();
  const view = slots.protoFeedbackOps?.(spaceId);
  return {
    links: view?.links ?? null,
    draftOrigin: view?.draftOrigin ?? false,
    hubHref: view && can('collab:hub') ? view.hubHref : null,
  };
}

/** Hub href does not depend on the workspace. Any declared space reads the same value. */
export function useProtoHubHref() {
  const { slots, can, registry } = usePlatform();
  const spaceId = registry.spaces[0]?.id;
  if (!spaceId || !can('collab:hub')) return null;
  return slots.protoFeedbackOps?.(spaceId)?.hubHref ?? null;
}

function entryName(label: string, lang: 'ko' | 'en') {
  return lang === 'ko' ? `${label} — FeedbackOps, 새 탭` : `${label} — FeedbackOps, new tab`;
}

function hubName(lang: 'ko' | 'en') {
  return lang === 'ko' ? 'FeedbackOps 전체 — 새 탭' : 'All of FeedbackOps — new tab';
}

function hubLabel(lang: 'ko' | 'en') {
  return lang === 'ko' ? 'FeedbackOps 전체' : 'All of FeedbackOps';
}

export function FeedbackOpsBlock({ links, systemName, draftOrigin, collapsed }: {
  links: readonly ProtoFeedbackOpsLink[];
  systemName: Text;
  draftOrigin: boolean;
  collapsed: boolean;
}) {
  const { tx, lang } = useI18n();
  const heading = `FeedbackOps · ${tx(systemName)}`;
  const caption = lang === 'ko' ? 'FeedbackOps에서 열립니다 · 새 탭' : 'Opens in FeedbackOps · new tab';
  const draft = lang === 'ko' ? ' (시안 주소)' : ' (prototype address)';
  return <>
    {!collapsed && <p className="mx-2 mb-1 text-caption font-semibold text-text-secondary">{heading}</p>}
    <ul className="space-y-0.5">
      {links.map(link => <li key={link.id}><FeedbackOpsAnchor link={link} collapsed={collapsed} /></li>)}
    </ul>
    {!collapsed && <p className="px-3 pt-1 text-caption text-text-secondary">{caption}{draftOrigin ? draft : ''}</p>}
  </>;
}

function FeedbackOpsAnchor({ link, collapsed }: { link: ProtoFeedbackOpsLink; collapsed: boolean }) {
  const { tx, lang } = useI18n();
  const label = tx(link.label);
  const Icon = ITEM_ICON[link.id];
  const anchor = <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={entryName(label, lang)}
    className={cn('relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0')}>
    {collapsed
      ? <Icon className="size-4 shrink-0" aria-hidden />
      : <><span className="min-w-0 flex-1 truncate">{label}</span><ExternalLink className="size-3.5 shrink-0" aria-hidden /></>}
  </a>;
  return collapsed
    ? <Tooltip><TooltipTrigger asChild>{anchor}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
    : anchor;
}

export function FeedbackOpsHubLink({ href, collapsed = false }: { href: string; collapsed?: boolean }) {
  const { lang } = useI18n();
  const label = hubLabel(lang);
  const anchor = <a href={href} target="_blank" rel="noopener noreferrer" aria-label={hubName(lang)}
    className={cn('flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0')}>
    {collapsed
      ? <ExternalLink className="size-4 shrink-0" aria-hidden />
      : <><span className="min-w-0 flex-1 truncate">{label}</span><ExternalLink className="size-3.5 shrink-0" aria-hidden /></>}
  </a>;
  return collapsed
    ? <Tooltip><TooltipTrigger asChild>{anchor}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
    : anchor;
}

export function RailFeedbackOpsHub({ href }: { href: string }) {
  const { lang } = useI18n();
  return <Tooltip><TooltipTrigger asChild>
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={hubName(lang)}
      className="relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover">
      <ExternalLink className="size-4" aria-hidden />
    </a>
  </TooltipTrigger><TooltipContent side="right">{hubLabel(lang)}</TooltipContent></Tooltip>;
}

export function PopoverFeedbackOpsHub({ href }: { href: string }) {
  const { lang } = useI18n();
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={hubName(lang)}
    className="mt-1 flex items-center gap-2 border-t border-border-subtle px-2 pt-2 text-left text-sm text-text-primary hover:bg-surface-row-hover">
    <ExternalLink className="size-4 shrink-0 text-text-secondary" aria-hidden />
    <span className="min-w-0 flex-1 truncate">{hubLabel(lang)}</span>
  </a>;
}
