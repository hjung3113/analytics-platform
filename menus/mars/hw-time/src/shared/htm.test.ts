import { describe, expect, it } from 'vitest';
import { htmEmphasisStatus, htmStatusText, htmStatusView } from './htm';

describe('htmStatusView (#1794 server judgement)', () => {
  it('maps over to danger, under to warning, unjudgeable to neutral with its reason, normal to nothing', () => {
    expect(htmStatusView({ status: 'over' }, 'ko')).toEqual({ tone: 'danger', label: 'HTM 상한 초과' });
    expect(htmStatusView({ status: 'under' }, 'ko')).toEqual({ tone: 'warning', label: 'HTM 하한 미달' });
    expect(htmStatusView({ status: 'unjudgeable', reason: 'recipe-unsplit' }, 'ko')?.label).toBe('Recipe 미구분 — 판정 불가');
    expect(htmStatusView({ status: 'unjudgeable', reason: 'no-criteria' }, 'ko')?.tone).toBe('neutral');
    expect(htmStatusView({ status: 'normal' }, 'ko')).toBeUndefined();
    expect(htmStatusText({ status: 'normal' }, 'ko')).toBe('정상');
  });
});

it.each(['ko', 'en'] as const)('emphasises only out-of-bound HTM statuses in %s', lang => {
  for (const status of ['over', 'under', 'normal', 'unjudgeable'] as const) {
    const view = htmStatusView({ status, reason: 'no-criteria' }, lang);
    expect(htmEmphasisStatus(view)).toEqual(status === 'over' || status === 'under' ? view : undefined);
  }
  expect(htmEmphasisStatus(undefined)).toBeUndefined();
});
