import type { DetailPanelHeaderProps } from '@ap/ui';

/** Feature-owned labels and existing SDK accents; UI primitives know no feature vocabulary. */
export const DETAIL_PANEL_KICKERS = {
  voc: { 'data-kind': 'voc', label: 'VOC', accent: 'voc' },
  finding: { 'data-kind': 'finding', label: 'Finding', accent: 'success' },
  task_request: { 'data-kind': 'task_request', label: 'Task 요청', accent: 'warn' },
  task: { 'data-kind': 'task', label: 'Task', accent: 'task' },
  survey: { 'data-kind': 'survey', label: '설문', accent: 'info' },
  cluster: { 'data-kind': 'cluster', label: '반복 VOC', accent: 'warn' },
  milestone: { 'data-kind': 'milestone', label: 'Milestone', accent: 'warn', appearance: 'badge' },
} as const satisfies Record<string, Pick<DetailPanelHeaderProps, 'label' | 'accent' | 'appearance' | 'data-kind'>>;
