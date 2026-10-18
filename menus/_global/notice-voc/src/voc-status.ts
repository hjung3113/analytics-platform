/**
 * Menu-local reporter-facing VOC status vocabulary (issue #60 §4; 06 §24 — one consumer, so it stays in
 * the menu). Labels are for this screen only; the wire value `MyVocStatus` is never rewritten, and an
 * unknown token cannot occur (the union is exhaustive here at compile time). Korean labels are the
 * FeedbackOps canonical strings (FO ADR-0005, `ReporterStatusBadge`) so a VOC reads the same in both
 * apps (#234); `@fops/shared` carries only the enum, not the labels.
 */
import type { MyVocStatus } from './endpoints';
import type { Tone } from '@ap/ui';

export type VocStatusInfo = { ko: string; en: string; tone: Tone };

export const VOC_STATUS: Record<MyVocStatus, VocStatusInfo> = {
  received: { ko: '접수됨', en: 'Received', tone: 'info' },
  reviewing: { ko: '검토 중', en: 'Reviewing', tone: 'info' },
  assigned: { ko: '담당자 배정됨', en: 'Assigned', tone: 'warning' },
  progress: { ko: '처리 중', en: 'In progress', tone: 'warning' },
  prep: { ko: '해결 준비 중', en: 'Preparing', tone: 'warning' },
  resolved: { ko: '해결됨', en: 'Resolved', tone: 'success' },
  reopened: { ko: '다시 처리 중', en: 'Reopened', tone: 'danger' },
  closed: { ko: '종료됨', en: 'Closed', tone: 'neutral' },
};
