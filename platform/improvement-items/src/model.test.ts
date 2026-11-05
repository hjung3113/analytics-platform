import { describe, expect, it } from 'vitest';
import { filtersForView, moveErrors, questPresentation, originPeriod, createErrors } from './model';

describe('improvement item screen contracts', () => {
  it('keeps done items in my assignments and excludes verified/dropped', () => {
    expect(filtersForView('mine')).toEqual([{ id: 'assignee', op: 'in', value: ['me'] }, { id: 'status', op: 'notIn', value: ['verified', 'dropped'] }]);
    expect(filtersForView('all')).toEqual([]);
    expect(filtersForView('unlinked')).toEqual([{ id: 'questLinked', op: 'in', value: ['false'] }]);
  });
  it.each([
    ['in_progress', {}, ['action']], ['done', { action: 'fix' }, ['actionDate']],
    ['verified', {}, ['effect']], ['dropped', {}, ['reason']], ['reopen', {}, ['reason']],
    ['verified', { effect: 'effective' }, []], ['reopen', { reason: 'again' }, []],
  ] as const)('validates %s before confirmation', (move, draft, expected) => {
    expect(moveErrors(move, draft)).toEqual(expected);
  });
  it('refuses an empty problem and requires an origin or target', () => {
    expect(createErrors({ problem: '  ', origin: null, targets: [] })).toEqual(['problem', 'origin']);
    expect(createErrors({ problem: 'problem', origin: { menuId: 'cycle-time', context: {} }, targets: [] })).toEqual([]);
  });
  it.each(['not_found', 'unavailable', 'forbidden'] as const)('keeps the Quest snapshot for %s without a link', state => {
    expect(questPresentation(state, 'saved title', null)).toMatchObject({ title: 'saved title', linked: false });
  });
  it('uses the current Quest title only on ok and falls back on unsupported search', () => {
    expect(questPresentation('ok', 'old', { id: 'Q1', title: 'current', status: 'Active' })).toMatchObject({ title: 'current' });
    expect(questPresentation('unsupported', 'saved', null).directEntry).toBe(true);
  });
  it('shows both wall-clock endpoints as KST, separately from action date', () => {
    expect(originPeriod({ from: '2026-11-01T00:00', to: '2026-11-05T00:00' }, 'ko')).toBe('2026-11-01 00:00 – 2026-11-05 00:00 KST');
  });
});
