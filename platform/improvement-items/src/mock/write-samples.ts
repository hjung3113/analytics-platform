/** Menu-owned repeatable conformance inputs (#2010); never imported by production screens. */
import { improvementItemsActionsMock } from './index';
let sampleSeq = 0;
const unique = (label: string) => `CF-${label}-${++sampleSeq}`;
// The improvement writes (#1328 d) run on seed items (`platform/improvement-items/src/mock/index.ts`, ids `13280000-…-<n>`):
// 1 is open with no quest, 2 is in_progress with quest Q-1. Re-sending values the row already has changes nothing, so
// itemUpdate/itemAssign/itemLinkQuest succeed again on every call (the mock bumps the version only when the row really
// changed); a status move and a reopen can never re-send a state (FORWARD is one-way, REOPEN always flips), so those
// samples stage their own fresh item, like the import samples stage their job.
const improvementSeedId = (n: number) => `13280000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const IMPROVEMENT_OPEN = improvementSeedId(1);
const IMPROVEMENT_QUESTED = improvementSeedId(2);
const improvementHandler = (id: string) => improvementItemsActionsMock.find(action => action.spec.id === `improvement.${id}`)!;
const stagedOpenItem = (): string => {
  const { itemId } = improvementHandler('itemCreate').handle({ input: { problem: unique('IS'), targets: [{ kind: 'equipment', externalKey: 'EQ-01', displayName: 'EQ-01' }] }, actor: 'admin', scopeId: null }).data as { itemId: string };
  return itemId;
};
const improvementSamples: Record<string, () => Record<string, unknown>> = {
  itemCreate: () => ({ problem: unique('IC'), targets: [{ kind: 'equipment', externalKey: 'EQ-01', displayName: 'EQ-01' }] }),
  itemUpdate: () => ({ itemId: IMPROVEMENT_OPEN, problem: '이송 대기 시간 증가' }),
  itemSetStatus: () => ({ itemId: stagedOpenItem(), status: 'in_progress', action: '적합성 표본 조치' }),
  itemReopen: () => {
    const itemId = stagedOpenItem();
    // FORWARD is one-way (open → done is not a legal move, the server refuses it), so staging follows the legal path.
    improvementHandler('itemSetStatus').handle({ input: { itemId, status: 'in_progress', action: '적합성 표본 조치' }, actor: 'admin', scopeId: null });
    improvementHandler('itemSetStatus').handle({ input: { itemId, status: 'done', action: '적합성 표본 조치', actionDate: '2026-11-04' }, actor: 'admin', scopeId: null });
    return { itemId, reason: '적합성 표본 재열기' };
  },
  itemAssign: () => ({ itemId: IMPROVEMENT_OPEN, assigneeId: null }),
  itemLinkQuest: () => ({ itemId: IMPROVEMENT_QUESTED, questId: 'Q-1', questTitle: '대기 시간 줄이기' }),
};

export const improvementItemsWriteSamples: Readonly<Record<string, () => Record<string, unknown>>> = Object.fromEntries(
  Object.entries({ ...improvementSamples }).map(([name, sample]) => [`improvement.${name}`, sample]),
);
