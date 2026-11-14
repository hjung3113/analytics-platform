import { describe, expect, it } from 'vitest';
import { defineAction, menuPermission, type ActionResponse } from '@ap/contracts';
import type { ConformanceCheck, ServerConformanceHarness } from '../types';
import { planActionChecks } from '../plan/actions';
import { planConsoleChecks } from '../plan/ports/console';
import { planServiceChecks } from '../plan/ports/services';

const answer = (outcome: ActionResponse<unknown>['outcome'], replayed = false) => ({ outcome, replayed, data: { id: 'fixture-notice', version: 'v1' }, version: 'v1', fieldErrors: [], correlationId: 'fixture' });
const action = defineAction({ id: 'fixture.append', menuId: 'fixture', permission: menuPermission('analytics:view'), requiresScope: false, concurrency: 'none', inputKeys: {}, invalidates: [] });
function sample(broken: boolean): ServerConformanceHarness {
  let written = false;
  return {
    adapter: {
      saveNotice: async (input: { idempotencyKey: string; until: string }) => {
        const invalid = input.idempotencyKey === 'not-a-uuid' || input.until === '2026-02-30T00:00:00';
        if (invalid) return answer(broken ? 'ok' : 'invalid');
        const replayed = written && !broken;
        written = true;
        return answer('ok', replayed);
      },
      listNotices: async () => ({ outcome: 'ok', data: { items: [{ id: 'fixture-notice' }] } }),
      deleteNotice: async () => answer('ok'),
      menuAction: async () => { const replayed = written && !broken; written = true; return answer('ok', replayed); },
      auditTrail: async () => ({ outcome: broken ? 'ok' : 'error' }),
    },
    actions: [{ spec: action, input: {} }],
    asGranted: async (run: () => Promise<unknown>) => run(),
    ports: { usage: { menuId: 'fixture' } },
  } as unknown as ServerConformanceHarness;
}
const checkOf = (checks: ConformanceCheck[], name: string) => {
  const check = checks.find((entry) => entry.id.includes(name));
  if (!check) throw new Error(`Missing check: ${name}`);
  return check;
};

describe('minor parity conformance checks', () => {
  it.each([true, false])('detects invalid notice keys and dates: broken=%s', async (broken) => {
    for (const name of ['saveNotice rejects a non-UUID key', 'saveNotice rejects an impossible date']) {
      const result = await checkOf(planServiceChecks(sample(broken)), name).run();
      expect(result === null).toBe(!broken);
    }
  });
  it.each([true, false])('detects notice and action case-sensitive replay: broken=%s', async (broken) => {
    const notice = await checkOf(planServiceChecks(sample(broken)), 'saveNotice replays a UUID key regardless of letter case').run();
    const action = await checkOf(planActionChecks(sample(broken)), 'UUID key letter case').run();
    expect(notice === null).toBe(!broken);
    expect(action === null).toBe(!broken);
  });
  it.each([true, false])('detects an unsafe audit page: broken=%s', async (broken) => {
    const result = await checkOf(planConsoleChecks(sample(broken)), 'auditTrail rejects an unsafe integer page').run();
    expect(result === null).toBe(!broken);
  });
});
