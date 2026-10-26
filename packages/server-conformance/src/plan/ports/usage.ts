import type { ApiResponse, UsageEvent, UsageSummary } from '@ap/contracts';
import type { ConformanceCheck, ServerConformanceHarness } from '../../types';
import { describeResponse } from '../../helpers';

export function planUsageChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter, ports } = harness;
  const checks: ConformanceCheck[] = [];
  // Usage telemetry (checklist §2 fire-and-forget, §5): the server stamps the session user and the receive
  // time; the client `at`/`enteredAt` are shape-checked and stored, and one bad event rejects the whole call.
  // ports.usage may arrive dwell-shaped: derive the entry from its identity fields (drop dwellMs/enteredAt) so
  // a dwell sample cannot turn the valid-entry event invalid.
  const usageEntry: UsageEvent = {
    name: 'entry', menuId: ports.usage.menuId, spaceId: ports.usage.spaceId, path: ports.usage.path,
    sessionId: ports.usage.sessionId, at: Date.now(),
  };
  const usageDwell: UsageEvent = { ...usageEntry, name: 'dwell', enteredAt: usageEntry.at, dwellMs: 1200 };
  const badUsageEvent = (patch: Record<string, unknown>): UsageEvent => ({ ...usageEntry, ...patch }) as unknown as UsageEvent;
  const expectAccepted = (events: readonly UsageEvent[], accepted: number, why: string) => async () => {
    const r = await adapter.recordUsage(events);
    return r.accepted === accepted ? null : `${why}: expected accepted ${accepted}, got ${r.accepted}`;
  };
  checks.push({
    id: 'port · recordUsage accepts a valid entry and dwell',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([usageEntry, usageDwell], 2, 'a valid entry and dwell'),
  });
  // Global utility menus send spaceId null (06 §9.1). Null is always valid on this port, so the check clones
  // the harness sample instead of skipping when no separate global sample was given. The server does not
  // know the app's spaces (ADR-0072), so it judges a space id by shape only: a malformed one is rejected.
  // Board provenance (ADR-0049): `source` is optional (absent = legacy main), `board` carries an opaque stayId.
  const boardEntry: UsageEvent = { ...usageEntry, source: 'board', stayId: 'conformance-stay-1' };
  const boardDwell: UsageEvent = { ...usageDwell, source: 'board', stayId: 'conformance-stay-1' };
  checks.push({
    id: 'port · recordUsage accepts a board entry and dwell (source, stayId)',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([boardEntry, boardDwell], 2, 'a valid board entry and dwell with source and stayId'),
  });
  checks.push({
    id: 'port · recordUsage accepts an explicit main source and a legacy event without one',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageEntry, source: 'main' }, usageEntry], 2, 'an explicit main source next to a legacy event without source'),
  });
  checks.push({
    id: 'port · recordUsage: an unknown source is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ source: 'sidebar' })], 0, 'a source other than main/board — the whole call rejects'),
  });
  // Navigation path (#605): `via` and `fromMenuId` on a main-screen entry only; `via` is a closed set.
  checks.push({
    id: 'port · recordUsage accepts via and fromMenuId on a main entry',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageEntry, via: 'sidebar', fromMenuId: ports.usage.menuId }, { ...usageEntry, source: 'main', via: 'direct', fromMenuId: null }], 2, 'a main entry with via and fromMenuId (a menu id or null)'),
  });
  checks.push({
    id: 'port · recordUsage: a via outside the closed set is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ via: 'bookmark' })], 0, 'a via outside the closed set — the whole call rejects'),
  });
  checks.push({
    id: 'port · recordUsage: a stayId without board source is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ stayId: 'conformance-stay-1' })], 0, 'a stayId on a non-board event — the whole call rejects'),
  });
  checks.push({
    id: 'port · recordUsage: an unknown key next to source is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...boardEntry, paneId: 'p1' } as unknown as UsageEvent], 0, 'an unknown key on a board event — the whole call rejects'),
  });
  checks.push({
    id: 'port · recordUsage accepts a global menu (spaceId null)',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageEntry, spaceId: null }], 1, 'a global menu (spaceId null)'),
  });
  checks.push({
    id: 'port · recordUsage: a malformed spaceId is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ spaceId: 'a b' })], 0, 'a space id with whitespace'),
  });
  checks.push({
    id: 'port · recordUsage: one bad event rejects the whole call',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([usageEntry, badUsageEvent({ url: '/equipment?scopeId=MEM' })], 0, 'one bad event among a valid one — the whole call rejects (checklist §5)'),
  });
  checks.push({
    id: 'port · recordUsage: a client userId is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ userId: 'someone-else' })], 0, 'a client-sent userId — the server stamps the session user'),
  });
  checks.push({
    id: 'port · recordUsage: a concrete path with a query is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ path: `${usageEntry.path}?scopeId=MEM` })], 0, 'a concrete pathname with a query — only the manifest route pattern travels'),
  });
  checks.push({
    id: 'port · recordUsage: a non-numeric at is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([badUsageEvent({ at: 'now' })], 0, 'a non-numeric at'),
  });
  checks.push({
    id: 'port · recordUsage: a non-numeric enteredAt is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageDwell, enteredAt: 'then' } as unknown as UsageEvent], 0, 'a non-numeric enteredAt'),
  });
  checks.push({
    id: 'port · recordUsage: a negative dwellMs is rejected',
    uses: ['recordUsage'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectAccepted([{ ...usageDwell, dwellMs: -1 }], 0, 'a negative dwellMs'),
  });
  // Checklist §4 clock constraint: the ±10 min window is on the test runner's clock, compared against the
  // server's receive stamps — keep runner and server within a few minutes (NTP). The 1970-01-01 window must
  // still answer ok (zero) on a retention-limited server.
  //
  // Sequential (#152 round D): the harness guarantees only that the granted actor may record `ports.usage`,
  // so the probe records under `asGranted` and reads the summaries under `asConsole`. It must run alone —
  // never inside a concurrent granted/console batch, where switching actors would race the batch's role.
  checks.push({
    id: 'port · usageSummary counts by receive time, not the client at',
    uses: ['recordUsage', 'usageSummary'],
    mode: 'sequential',
    run: async () => {
      const visitsOf = (r: ApiResponse<UsageSummary>): number => r.data?.menus.find(m => m.menuId === ports.usage.menuId)?.visits ?? 0;
      const t0 = Date.now();
      const receiveWindow = { from: t0 - 10 * 60_000, to: t0 + 10 * 60_000 };
      const before = await harness.asConsole(() => adapter.usageSummary(receiveWindow));
      if (before.outcome !== 'ok') return `the window summary: expected ok, got ${describeResponse(before)}`;
      // Epoch 0 is a finite number — shape-valid (checklist §5); only the receive time may place it.
      // recordUsage is fire-and-forget (checklist §2): it may reject — report that, not a missing envelope.
      let recorded: { accepted: number };
      try {
        recorded = await harness.asGranted(() => adapter.recordUsage([{ ...usageEntry, at: 0 }]));
      } catch (error) {
        return `recordUsage threw/rejected: ${String(error)}`;
      }
      if (recorded.accepted !== 1) return `the epoch-0 entry: expected accepted 1, got ${recorded.accepted}`;
      const after = await harness.asConsole(() => adapter.usageSummary(receiveWindow));
      if (after.outcome !== 'ok') return `the window summary after recording: expected ok, got ${describeResponse(after)}`;
      // ≥, not ===: a shared test server may receive other visits for this menu meanwhile.
      if (visitsOf(after) < visitsOf(before) + 1) {
        return `the epoch-0 entry was not counted in its receive-time window (${visitsOf(after)} after vs ${visitsOf(before)} before)`;
      }
      const epochDay = await harness.asConsole(() => adapter.usageSummary({ from: 0, to: 86_400_000 }));
      if (epochDay.outcome !== 'ok') return `the 1970-01-01 summary: expected ok, got ${describeResponse(epochDay)}`;
      const there = epochDay.data?.menus.find(m => m.menuId === ports.usage.menuId);
      if (there && there.visits > 0) {
        return 'the epoch-0 entry was counted on 1970-01-01 — the aggregate uses the client at, not the server receive time (checklist §5)';
      }
      return null;
    },
  });
  return checks;
}
