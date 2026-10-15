import { describe, expect, it } from 'vitest';
import type { MyVocStatus } from './endpoints';
import { VOC_STATUS } from './voc-status';

// The eight literals, listed here so a new MyVocStatus member fails this test until it gets a label.
const STATUSES: readonly MyVocStatus[] = [
  'received', 'reviewing', 'assigned', 'progress', 'prep', 'resolved', 'reopened', 'closed',
];

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
});
