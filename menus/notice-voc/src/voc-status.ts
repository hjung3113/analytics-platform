/**
 * Menu-local reporter-facing VOC status vocabulary (issue #60 §4; 06 §24 — one consumer, so it stays in
 * the menu). Labels are for this screen only; the wire value `MyVocStatus` is never rewritten, and an
 * unknown token cannot occur (the union is exhaustive here at compile time).
 */
import type { MyVocStatus } from './endpoints';
import type { Tone } from '@ap/ui';

export type VocStatusInfo = { ko: string; en: string; tone: Tone };

export const VOC_STATUS: Record<MyVocStatus, VocStatusInfo> = {
  received: { ko: '접수', en: 'Received', tone: 'info' },
  reviewing: { ko: '검토', en: 'Reviewing', tone: 'info' },
  assigned: { ko: '담당 지정', en: 'Assigned', tone: 'warning' },
  progress: { ko: '처리 중', en: 'In progress', tone: 'warning' },
  prep: { ko: '준비', en: 'Preparing', tone: 'warning' },
  resolved: { ko: '해결', en: 'Resolved', tone: 'success' },
  reopened: { ko: '재오픈', en: 'Reopened', tone: 'danger' },
  closed: { ko: '종료', en: 'Closed', tone: 'neutral' },
};
