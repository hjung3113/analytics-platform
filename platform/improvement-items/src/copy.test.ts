import { describe, expect, it } from 'vitest';

import { STATUS_LABELS } from './copy';

describe('improvement-item status labels', () => {
  it('uses the wording also shown in notifications', () => {
    expect(STATUS_LABELS.ko).toEqual({
      open: '문제 기록',
      in_progress: '조치 중',
      done: '조치 완료',
      verified: '효과 확인됨',
      dropped: '취소',
    });
  });
});
