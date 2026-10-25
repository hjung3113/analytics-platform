// The notifications panel as its own bridge entry (platform ADR-0071 decision 1): the rail's recent popover loads it lazily, so the panel and its
// reads stay out of the eagerly loaded `core` subset (and the platform start chunk). Same import rules as `core`.
export { InboxPanel } from '@/features/home/InboxPanel';
