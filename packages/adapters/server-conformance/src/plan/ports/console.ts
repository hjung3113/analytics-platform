import type { ApiResponse } from '@ap/contracts';
import type { ConformanceCheck, ServerConformanceHarness } from '../../types';
import { CONSOLE_ACCESS, assessmentProblem, describeResponse, expectOutcome, missingEnvelopeKey, trustProblem } from '../../helpers';

export function planConsoleChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter } = harness;
  const checks: ConformanceCheck[] = [];
  // Console reads (checklist §2): console:access under the console actor, forbidden without it. The zero
  // outcomes are contract text (adapter.ts, checklist §2): usageSummary — nothing matched is a successful
  // zero, `ok` with `menus: []`, never `empty` (the console left-joins zero-visit menus; `empty` would hide
  // them); auditTrail and accessDirectory — a query that matches nothing is `empty`. This check reads page 1
  // (`auditTrail({})` / `accessDirectory({})`), where an `ok` with no rows or `total: 0` is the zero case.
  const consoleReads = [
    { method: 'auditTrail', allowEmpty: true, send: (): Promise<ApiResponse<{ items: readonly unknown[]; total: number }>> => adapter.auditTrail({}) },
    { method: 'accessDirectory', allowEmpty: true, send: (): Promise<ApiResponse<{ items: readonly unknown[]; total: number }>> => adapter.accessDirectory({}) },
    { method: 'usageSummary', allowEmpty: false, send: () => adapter.usageSummary({ preset: 'all' }) },
  ] as const;
  for (const read of consoleReads) {
    checks.push({
      id: `port · ${read.method} as a console actor → ok`,
      uses: [read.method],
      mode: 'console',
      run: async () => {
        if (!read.allowEmpty) {
          const r = await read.send();
          if (r.outcome !== 'ok') {
            return `a console actor reading ${read.method}: expected ok, got ${describeResponse(r)} — a zero is ok with menus: [], never empty (adapter.ts)`;
          }
          const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
          if (missing) return missing;
          return assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
        }
        const r = await read.send();
        if (r.outcome === 'empty') return null; // adapter.ts: a zero is a confirmed result.
        if (r.outcome !== 'ok') {
          return `a console actor reading ${read.method}: expected ok or empty, got ${describeResponse(r)}`;
        }
        if (r.data === null || r.data.items.length === 0 || r.data.total === 0) {
          return `an ok ${read.method} page 1 with no rows or total: 0 is the zero case — outcome empty, not ok (adapter.ts)`;
        }
        // Every successful `ok` answers the full 06 §19/§18 envelope shape (#152 round D).
        const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
        if (missing) return missing;
        return assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
      },
    });
    checks.push({
      id: `port · ${read.method} without console:access → forbidden`,
      uses: [read.method],
      mode: 'permission',
      run: () => harness.withoutPermission(
        CONSOLE_ACCESS,
        expectOutcome(read.send, 'forbidden', `the console read ${read.method} requires console:access`),
      ),
    });
  }
  // usageNextScreens (#605): three requests in all, to stay inside the shared per-actor rate budget. The answer's numbers depend on
  // the server's data, so the checks assert invariants that hold for any data: the mask (k = 3, ADR-0020 supplement) and the
  // internal consistency of every row — no seeded counts. Cases that need a seeded long tail live in the mock and server tests.
  const nextMenuId = harness.ports.usage.menuId;
  checks.push({
    id: 'port · usageNextScreens as a console actor → ok, masked or internally consistent',
    uses: ['usageNextScreens'],
    mode: 'console',
    run: async () => {
      const r = await adapter.usageNextScreens({ menuId: nextMenuId });
      if (r.outcome !== 'ok' || r.data === null) {
        return `a console actor reading usageNextScreens for a well-formed menu: expected ok, got ${describeResponse(r)} — a menu without data is ok with masked: true, never empty`;
      }
      const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
      if (missing) return missing;
      const problem = assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
      if (problem) return problem;
      const d = r.data;
      if (d.menuId !== nextMenuId) return `the answer names menu ${JSON.stringify(d.menuId)}, not the requested one`;
      const { moved, sameMenu, backOrReturn, noMove } = d.summary;
      if (d.masked) {
        return d.entries === 0 && moved + sameMenu + backOrReturn + noMove === 0 && d.next.length === 0 && d.hiddenDestinations === 0
          ? null
          : 'a masked answer (menu with 1–2 distinct main-entry users) must carry no numbers: entries 0, summary all 0, next [], hiddenDestinations 0';
      }
      if (d.entries === 0) {
        return moved + sameMenu + backOrReturn + noMove === 0 && d.next.length === 0 && d.hiddenDestinations === 0
          ? null
          : 'an unmasked answer without any main entry (masked: false, entries: 0) must carry no numbers: summary all 0, next [], hiddenDestinations 0';
      }
      // noMove is max(0, entries − the other three): one entry can be followed by several, so the sum is >= entries (equal unless the floor applied).
      if (moved + sameMenu + backOrReturn + noMove < d.entries) return `summary must sum to at least entries (${moved}+${sameMenu}+${backOrReturn}+${noMove} vs ${d.entries})`;
      if (noMove !== Math.max(0, d.entries - moved - sameMenu - backOrReturn)) return `noMove must be max(0, entries − moved − sameMenu − backOrReturn), got ${noMove}`;
      if (d.next.length > 20) return `next holds ${d.next.length} rows, at most 20`;
      if (!Number.isInteger(d.hiddenDestinations) || d.hiddenDestinations < 0) return 'hiddenDestinations must be a non-negative integer';
      let previous = Number.POSITIVE_INFINITY;
      for (const n of d.next) {
        if (n.distinctUsers < 3) return `a destination with ${n.distinctUsers} distinct users must be folded into hiddenDestinations, never named (mask k = 3)`;
        if (n.count > previous) return 'next must be ordered by count, descending';
        previous = n.count;
        const viaSum = Object.values(n.vias).reduce((a, b) => a + (b ?? 0), 0);
        // vias is all-or-nothing: {} (a via kind under 3 people was present) or the full split of count.
        if (viaSum !== 0 && viaSum !== n.count) return `a row's vias must be {} or come from the same set as its count (vias sum ${viaSum}, count ${n.count})`;
        if (Object.values(n.vias).some((v) => (v ?? 0) < 3)) return 'a via kind used by fewer than 3 distinct people can never be listed: a row\'s vias is {} unless every via has at least 3 people';
        if (n.distinctUsers > n.count) return `a row cannot have more distinct users (${n.distinctUsers}) than events (${n.count})`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · usageNextScreens without console:access → forbidden',
    uses: ['usageNextScreens'],
    mode: 'permission',
    run: () => harness.withoutPermission(
      CONSOLE_ACCESS,
      expectOutcome(() => adapter.usageNextScreens({ menuId: nextMenuId }), 'forbidden', 'the console read usageNextScreens requires console:access'),
    ),
  });
  checks.push({
    id: 'port · usageNextScreens with a malformed menu id → error, never widened',
    uses: ['usageNextScreens'],
    mode: 'console',
    run: async () => {
      // One request: a path-shaped id fails the menu id rule (no `/`, `?`, `#`, `&`, `=`, whitespace or control characters).
      const bad = await adapter.usageNextScreens({ menuId: '/mars/item/SECRET' });
      return bad.outcome === 'error' && bad.data === null
        ? null
        : `a menu id that is not a menu id: expected error with null data, got ${describeResponse(bad)} — never answered as a menu or as all menus`;
    },
  });
  // ADR-0101: the auditTrail `type` filter is an opaque token. A well-formed type nobody has written is a zero
  // (`empty`, null data); a malformed one is `error`. Generic on purpose: the check names no domain type.
  checks.push({
    id: 'port · auditTrail type filter: well-formed unknown → empty, malformed → error',
    uses: ['auditTrail'],
    mode: 'console',
    run: async () => {
      const unknown = await adapter.auditTrail({ type: 'Conformance.Unused:type-1' });
      if (unknown.outcome !== 'empty' || unknown.data !== null) {
        return `a well-formed type that matches nothing: expected empty with null data, got ${describeResponse(unknown)} (checklist §2 auditTrail)`;
      }
      const withId = await adapter.auditTrail({ type: 'Conformance.Unused:type-1', targetId: 'conformance-missing-id' });
      if (withId.outcome !== 'empty' || withId.data !== null) {
        return `a well-formed type with a targetId that matches nothing: expected empty with null data, got ${describeResponse(withId)}`;
      }
      for (const type of ['1leading-digit', 'has space', 'a&b', 'a'.repeat(81)]) {
        const bad = await adapter.auditTrail({ type });
        if (bad.outcome !== 'error' || bad.data !== null) {
          return `a malformed type (${JSON.stringify(type.slice(0, 20))}): expected error with null data, got ${describeResponse(bad)} — never widened to all types`;
        }
      }
      return null;
    },
  });
  checks.push({
    id: 'port · accessDirectory is not mart data: no assessments, null trust',
    uses: ['accessDirectory'],
    mode: 'console',
    run: async () => {
      const r = await adapter.accessDirectory({});
      // A read that did not succeed is the `→ ok` check's failure; this check owns only the mart-data rule.
      if (r.outcome !== 'ok' && r.outcome !== 'empty') return null;
      const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
      if (missing) return missing;
      if (r.assessments.length > 0 || r.trust !== null) {
        return 'accessDirectory is not mart data (adapter.ts): no assessments, null trust';
      }
      return null;
    },
  });
  return checks;
}
