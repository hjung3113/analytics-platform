// Inbox constants and URL helpers shared by InboxScreen: the tab/filter/sort option lists and the
// comma-list codec of the three multi-value filter keys.

import { GLOSSARY } from '@/lib/copy/glossary';
import { VOC_INBOX_NO_LINK_TAB_LABEL } from '@/lib/copy/voc-views';
import { SEVERITY_LABELS } from '@ap/feature-ui';
import type { FilterCategory, ListToolbarTab, SortOption } from '@ap/ui';
import { Flag, Link as LinkIcon, TriangleAlert, User } from 'lucide-react';
import type { VocSearch } from './voc-search';

export type InboxTab = NonNullable<VocSearch['tab']>;
export type InboxSort = NonNullable<VocSearch['sort']>;

// Tab labels mirror screen-voc.jsx `VOC_TABS` verbatim except `similar` (#592 / ADR-0031):
// its URL key stays accepted for old links and saved views, but the tab is hidden until its
// predicate exists (see 04-voc-system, “Similar VOC Suggested”).
// The `urgent` flag flips the Unassigned tab to the danger token (red) per prototype.
//
// badgeCount is intentionally absent: the prototype's counts (9/7/12/4/5) are
// synthetic local-data aggregates. GET /vocs returns no per-tab count facet, so
// wiring live counts is data-deferred (see PR body, follow-up issue). We do not
// invent counts.
export const INBOX_TABS: ListToolbarTab[] = [
  { value: 'untriaged', label: GLOSSARY.untriaged, icon: Flag, tip: '아직 분류되지 않은 VOC' },
  { value: 'high', label: GLOSSARY.high, icon: TriangleAlert, tip: '높음 · 심각 심각도' },
  {
    value: 'unassigned',
    label: GLOSSARY.unassigned,
    urgent: true,
    icon: User,
    tip: '담당자 미지정',
  },
  {
    value: 'no-link',
    label: VOC_INBOX_NO_LINK_TAB_LABEL,
    icon: LinkIcon,
    tip: 'Finding / Task 연결 없음',
  },
  {
    value: 'high-no-link',
    label: GLOSSARY.highNoLink,
    icon: TriangleAlert,
    tip: '높음 이상인데 Finding / Task 연결 없음',
  },
  // The prototype has no No task icon or tip; reuse the link icon without inventing copy.
  { value: 'no-task', label: GLOSSARY.noTask, icon: LinkIcon },
];

export const FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: 'filter.severity',
    label: '심각도',
    options: Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    // Unified on the single URL/UI key `filter.reporterStatus` (#89). The
    // backend's long-form param `filter.reporter_facing_status` is produced
    // only at the useVocList query-string boundary. Previously this category
    // used `filter.reporter_facing_status` — a key that never appeared in the
    // URL — forcing a fragile read/write translation in this route.
    key: 'filter.reporterStatus',
    label: '상태',
    options: [
      { value: 'received', label: '접수됨' },
      { value: 'reviewing', label: '검토중' },
      { value: 'assigned', label: '배정됨' },
      { value: 'progress', label: '진행중' },
      { value: 'prep', label: '준비중' },
      { value: 'resolved', label: '해결됨' },
      { value: 'reopened', label: '재오픈' },
      { value: 'closed', label: '종료됨' },
    ],
  },
  {
    key: 'filter.owner',
    label: '담당',
    options: [
      { value: 'assigned', label: '배정됨' },
      { value: 'unassigned', label: '미배정' },
    ],
  },
];

export const SORT_OPTIONS: SortOption[] = [
  { value: 'created_at:desc', label: '최신순' },
  { value: 'created_at:asc', label: '오래된순' },
  { value: 'severity:desc', label: '심각도 높은순' },
  { value: 'severity:asc', label: '심각도 낮은순' },
  { value: 'reporter_facing_status:asc', label: '상태순' },
];

export const DEFAULT_SORT = 'created_at:desc';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a comma-list search string into a string array. */
export function parseCommaList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Serialise a string array back to a comma-list, or undefined when empty. */
export function serialiseCommaList(arr: string[]): string | undefined {
  return arr.length > 0 ? arr.join(',') : undefined;
}
