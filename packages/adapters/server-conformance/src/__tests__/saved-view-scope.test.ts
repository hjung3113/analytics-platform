import { expect, it } from 'vitest';
import type { SavedViewDraft } from '@ap/contracts';
import type { ServerConformanceHarness } from '../types';
import { planSavedViewChecks } from '../plan/ports/saved-views';

function sample({ denied = false, refuseScope = false } = {}): ServerConformanceHarness {
  return { ports: { savedViews: {
    menuId: 'fixture',
    user: {
      save: async (draft: SavedViewDraft) => refuseScope && draft.context.roomNames?.length
        ? { ok: false, reason: 'forbidden' }
        : { ok: true, value: { view: { ...draft, id: 'fixture-view', ownerId: 'fixture-owner' }, capabilities: {} } },
      list: async () => denied ? [{ id: 'fixture-denied', denied: true, reason: 'scope' }] : [],
    },
    admin: {},
  } } } as unknown as ServerConformanceHarness;
}
const run = (harness: ServerConformanceHarness, name: string) => {
  const check = planSavedViewChecks(harness).find((entry) => entry.id.includes(name));
  if (!check) throw new Error(`Missing check: ${name}`);
  return check.run();
};

it.each([true, false])('detects denied entries in saved-view lists: denied=%s', async (denied) => {
  const result = await run(sample({ denied }), 'list contains no denied entries');
  expect(result === null).toBe(!denied);
});
it.each([true, false])('detects a store that refuses a draft for data Scope: refused=%s', async (refuseScope) => {
  const result = await run(sample({ refuseScope }), 'save does not judge data Scope');
  expect(result === null).toBe(!refuseScope);
});
