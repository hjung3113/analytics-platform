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
