import { describe, expect, it } from 'vitest';
import type { MyVocStatus } from './endpoints';
import { VOC_STATUS } from './voc-status';

// The eight literals, listed here so a new MyVocStatus member fails this test until it gets a label.
const STATUSES: readonly MyVocStatus[] = [
  'received', 'reviewing', 'assigned', 'progress', 'prep', 'resolved', 'reopened', 'closed',
];

// FeedbackOps canonical reporter-facing labels (FO ADR-0005; `ReporterStatusBadge` LABELS in
// products/feedbackops/packages/ui). The same VOC must read the same in both apps (#234).
const FEEDBACKOPS_KO: Record<MyVocStatus, string> = {
  received: '접수됨',
  reviewing: '검토 중',
  assigned: '담당자 배정됨',
  progress: '처리 중',
  prep: '해결 준비 중',
  resolved: '해결됨',
  reopened: '다시 처리 중',
  closed: '종료됨',
};

describe('VOC_STATUS (menu-local reporter-facing vocabulary)', () => {
  it('covers exactly the eight declared statuses', () => {
    expect(Object.keys(VOC_STATUS).sort()).toEqual([...STATUSES].sort());
  });

  it('gives every status a ko label, an en label and a tone from the platform vocabulary', () => {
    for (const status of STATUSES) {
      const info = VOC_STATUS[status];
      expect(info.ko).toBeTruthy();
      expect(info.en).toBeTruthy();
      expect(['info', 'warning', 'success', 'danger', 'neutral']).toContain(info.tone);
    }
  });

  it('uses the FeedbackOps canonical Korean label for every status', () => {
    for (const status of STATUSES) expect(VOC_STATUS[status].ko).toBe(FEEDBACKOPS_KO[status]);
  });
});
