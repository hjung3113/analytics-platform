import { ENTITY_AUDIT_PAGE_MAX, instantEpochMs, type ApiResponse, type AuditEvent, type EntityAuditPage, type EntityRef } from '@ap/contracts';
import type { ConformanceCheck, ConformanceSkipped, ServerConformanceHarness } from '../../types';
import { UNKNOWN_ENTITY_TYPE, assessmentProblem, describeResponse, expectOutcome, missingEnvelopeKey, trustProblem } from '../../helpers';
import type { AtSite } from './shared';

export function planEntityAuditChecks(harness: ServerConformanceHarness, atSite: AtSite): ConformanceCheck[] {
  const { adapter, ports } = harness;
  const entityRef = ports.entity.ref;
  const ungrantedRoomRef = ports.entity.ungrantedRoomRef;
  const checks: ConformanceCheck[] = [];
  /**
   * Cursor pages of `entityAudit` (ADR-0085, checklist §2). A server whose first page carries no `nextCursor` key does
   * not page: every page check is then a visible run-time skip (`server does not page entityAudit`) and no `cursor`
   * is ever sent to it — not a pass. The probe is the plain first-page read the checks above already make.
   */
  function planEntityAuditPageChecks(): ConformanceCheck[] {
    const NOT_PAGED = 'server does not page entityAudit';
    const probe = async (): Promise<ConformanceSkipped | ApiResponse<EntityAuditPage>> => {
      const first = await adapter.entityAudit(entityRef);
      if (first.outcome !== 'ok' || !first.data) return { skipped: `the sample has no audit events to page (${describeResponse(first)})` };
      if (!('nextCursor' in first.data)) return { skipped: NOT_PAGED };
      return first;
    };
    const skipOr = (judge: (first: ApiResponse<EntityAuditPage>) => Promise<string | null>) => async (): Promise<string | null | ConformanceSkipped> => {
      const first = await probe();
      return 'skipped' in first ? first : judge(first);
    };
    /** A cursor the server really issued (page 1's `nextCursor`) plus the ids of the sample's first two pages, for the leak check. */
    const issue = async (): Promise<ConformanceSkipped | { cursor: string; sampleIds: ReadonlySet<string> }> => {
      const first = await probe();
      if ('skipped' in first) return first;
      const cursor = first.data?.nextCursor;
      if (typeof cursor !== 'string' || cursor === '') return { skipped: 'the sample fits one page — the server issued no cursor to replay' };
      const second = await adapter.entityAudit({ ...entityRef, cursor });
      const rows = [...(first.data?.events ?? []), ...(second.outcome === 'ok' ? second.data?.events ?? [] : [])];
      return { cursor, sampleIds: new Set(rows.map(event => event.id)) };
    };
    /** Replays the issued cursor at `target`: the answer is `want` and carries no row of the sample the cursor was issued for. */
    const replayRefused = async (target: EntityRef, issued: { cursor: string; sampleIds: ReadonlySet<string> }, want: 'forbidden' | 'error', why: string): Promise<string | null> => {
      const r = await adapter.entityAudit({ ...target, cursor: issued.cursor });
      const leaked = (r.data?.events ?? []).filter(event => issued.sampleIds.has(event.id));
      if (leaked.length > 0) return `an issued cursor replayed ${why} returned ${leaked.length} row(s) of the sample it was issued for (${describeResponse(r)})`;
      return r.outcome === want ? null : `an issued cursor replayed ${why}: expected ${want}, got ${describeResponse(r)}`;
    };
    const cursorProblem = (cursor: unknown): string | null =>
      cursor === null || (typeof cursor === 'string' && cursor !== '') ? null : 'nextCursor is a non-empty string, or null on the last page';
    return [
      {
        id: `port · entityAudit page holds at most ${ENTITY_AUDIT_PAGE_MAX} events`,
        uses: ['entityAudit'],
        mode: 'granted',
        run: skipOr(async first => {
          const events = first.data?.events ?? [];
          if (!Array.isArray(events)) return 'data.events is an array';
          if (events.length > ENTITY_AUDIT_PAGE_MAX) return `a page holds at most ${ENTITY_AUDIT_PAGE_MAX} events, got ${events.length}`;
          return cursorProblem(first.data?.nextCursor);
        }),
      },
      {
        id: 'port · entityAudit nextCursor walks every event once, in order, to a null cursor',
        uses: ['entityAudit'],
        mode: 'granted',
        run: skipOr(async first => {
          const seen = new Set<string>();
          const rows: AuditEvent[] = [];
          let page: ApiResponse<EntityAuditPage> = first;
          const cursors = new Set<string>();
          for (let pages = 1; pages <= 500; pages += 1) {
            const data = page.data;
            if (page.outcome !== 'ok' || !data) return `page ${pages}: expected ok with data, got ${describeResponse(page)}`;
            if (data.events.length > ENTITY_AUDIT_PAGE_MAX) return `page ${pages} holds ${data.events.length} events, more than ${ENTITY_AUDIT_PAGE_MAX}`;
            const problem = cursorProblem(data.nextCursor);
            if (problem) return `page ${pages}: ${problem}`;
            if (data.nextCursor && data.events.length === 0) return `page ${pages}: an empty page carries no non-null nextCursor`;
            for (const event of data.events) {
              if (seen.has(event.id)) return `event ${event.id} appears on more than one page`;
              seen.add(event.id);
              rows.push(event);
            }
            if (data.nextCursor === null || data.nextCursor === undefined) {
              for (let i = 1; i < rows.length; i += 1) {
                const diff = instantEpochMs(rows[i - 1]!.at) - instantEpochMs(rows[i]!.at);
                if (diff < 0 || (diff === 0 && rows[i - 1]!.id > rows[i]!.id)) return `events are ordered at desc (instant), then id asc; ${rows[i - 1]!.id} precedes ${rows[i]!.id}`;
              }
              return null;
            }
            if (cursors.has(data.nextCursor)) return `page ${pages}: nextCursor repeats an earlier cursor`;
            cursors.add(data.nextCursor);
            page = await adapter.entityAudit({ ...entityRef, cursor: data.nextCursor });
          }
          return 'nextCursor never reached null within 500 pages';
        }),
      },
      {
        id: 'port · entityAudit with a malformed cursor → error',
        uses: ['entityAudit'],
        mode: 'granted',
        run: skipOr(() => expectOutcome(() => adapter.entityAudit({ ...entityRef, cursor: '__conformance_invalid_cursor' }), 'error', 'a cursor the server never issued')()),
      },
      atSite({
        id: 'port · entityAudit with a cursor at a site without a grant → forbidden',
        uses: ['entityAudit'],
        needsSites: true,
        mode: 'granted',
        run: skipOr(() => expectOutcome(() => adapter.entityAudit({ ...entityRef, scopeId: harness.foreignScopeId, cursor: '__conformance_invalid_cursor' }), 'forbidden', 'a cursor is read only after the scope gate, so it opens nothing')()),
      }),
      {
        id: `port · entityAudit with a cursor without ${ports.entity.permission} → forbidden`,
        uses: ['entityAudit'],
        mode: 'permission',
        run: async () => {
          const first = await harness.asGranted(probe);
          if ('skipped' in first) return first;
          return harness.withoutPermission(
            ports.entity.permission,
            expectOutcome(() => adapter.entityAudit({ ...entityRef, cursor: '__conformance_invalid_cursor' }), 'forbidden', 'a cursor is read only after the permission gate'),
          );
        },
      },
      // The same gates with a cursor the server really issued: a server that trusts a valid cursor over the request
      // it arrives with would still pass the invalid-cursor checks above. Each replay must be refused like the
      // cursor-less request, and no row of the sample may come back.
      {
        id: 'port · entityAudit with an issued cursor on another destination → error',
        uses: ['entityAudit'],
        mode: 'granted',
        run: async () => {
          const issued = await issue();
          if ('skipped' in issued) return issued;
          const other: EntityRef = { ...entityRef, id: `${entityRef.id}__conformance_other` };
          const plain = await adapter.entityAudit(other);
          return replayRefused(other, issued, plain.outcome === 'forbidden' ? 'forbidden' : 'error', 'on another destination (a cursor is bound to the destination it was issued for)');
        },
      },
      atSite({
        id: 'port · entityAudit with an issued cursor at a site without a grant → forbidden',
        uses: ['entityAudit'],
        needsSites: true,
        mode: 'granted',
        run: async () => {
          const issued = await issue();
          return 'skipped' in issued ? issued : replayRefused({ ...entityRef, scopeId: harness.foreignScopeId }, issued, 'forbidden', 'at a site without a grant');
        },
      }),
      {
        id: `port · entityAudit with an issued cursor without ${ports.entity.permission} → forbidden`,
        uses: ['entityAudit'],
        mode: 'permission',
        run: async () => {
          const issued = await harness.asGranted(issue);
          if ('skipped' in issued) return issued;
          return harness.withoutPermission(ports.entity.permission, () => replayRefused(entityRef, issued, 'forbidden', 'by an account without the destination permission'));
        },
      },
      atSite({
        id: 'port · entityAudit with an issued cursor in an ungranted room → forbidden',
        uses: ['entityAudit'],
        needsSites: true,
        mode: ungrantedRoomRef ? 'granted' : 'skipped',
        run: ungrantedRoomRef
          ? async () => {
            const issued = await issue();
            return 'skipped' in issued ? issued : replayRefused(ungrantedRoomRef, issued, 'forbidden', 'for a destination in an ungranted room');
          }
          : async () => null, // never called: skipped checks are filtered out of every run
      }),
    ];
  }
  checks.push({
    id: 'port · entityAudit(sample) → events',
    uses: ['entityAudit'],
    mode: 'granted',
    run: async () => {
      const r = await adapter.entityAudit(entityRef);
      if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
      if (r.outcome === 'ok' && !Array.isArray(r.data?.events)) return 'an ok entityAudit answer carries data.events as an array';
      if (r.outcome === 'ok' && r.data?.events.length === 0) return 'a zero is outcome empty, not ok with no events (adapter.ts)';
      // Every successful envelope answers the full 06 §19/§18 shape (#152 round D), like getEntity above.
      const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
      if (missing) return missing;
      return assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
    },
  });
  checks.push({
    id: 'port · entityAudit of an unregistered type → error',
    uses: ['entityAudit'],
    mode: 'granted',
    run: expectOutcome(() => adapter.entityAudit({ ...entityRef, type: UNKNOWN_ENTITY_TYPE }), 'error', 'an unregistered entity type'),
  });
  checks.push(atSite({
    id: 'port · entityAudit at a site without a grant → forbidden',
    uses: ['entityAudit'],
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.entityAudit({ ...entityRef, scopeId: harness.foreignScopeId }), 'forbidden', 'a site the granted actor holds no grant for'),
  }));
  checks.push(atSite({
    id: 'port · entityAudit with a null Scope → forbidden',
    uses: ['entityAudit'],
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.entityAudit({ ...entityRef, scopeId: null }), 'forbidden', 'a site-scoped destination type with a null Scope leaves no site to read (adapter.ts: same gates as getEntity)'),
  }));
  // Same room re-check on the audit read (adapter.ts: same gates as getEntity).
  checks.push(atSite({
    id: 'port · entityAudit of a destination in an ungranted room → forbidden',
    uses: ['entityAudit'],
    needsSites: true,
    mode: ungrantedRoomRef ? 'granted' : 'skipped',
    run: ungrantedRoomRef
      ? expectOutcome(() => adapter.entityAudit(ungrantedRoomRef), 'forbidden', 'the site is granted but this destination\'s room is not (06 §22 room re-check)')
      : async () => null, // never called: skipped checks are filtered out of every run
  }));
  checks.push(...planEntityAuditPageChecks());
  checks.push({
    id: `port · entityAudit without ${ports.entity.permission} → forbidden`,
    uses: ['entityAudit'],
    mode: 'permission',
    run: () => harness.withoutPermission(
      ports.entity.permission,
      expectOutcome(() => adapter.entityAudit(entityRef), 'forbidden', 'the destination audit read uses that destination\'s view permission'),
    ),
  });
  return checks;
}
