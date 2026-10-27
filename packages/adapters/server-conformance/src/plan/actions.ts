import type { ActionResponse, MenuAction } from '@ap/contracts';
import type { ConformanceCheck, ServerConformanceHarness } from '../types';
import { describeAction } from '../helpers';

/**
 * The menuAction checks (ADR-0054, checklist §3–§4), derived per `harness.actions` sample. All run `sequential`: the
 * kit mints its own keys, and every granted request and `currentVersion()` read runs inside `asGranted` (sequential
 * mode selects no actor). Only the permission-before-replay check leaves the granted wrapper before the same
 * saved request goes through `withoutPermission`.
 */
export function planActionChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter } = harness;
  if (!harness.actions?.length) {
    return [{ id: 'actions: no sample', mode: 'skipped', uses: ['menuAction'], run: async () => null }];
  }
  const checks: ConformanceCheck[] = [];
  for (const c of harness.actions) {
    const actionStart = checks.length;
    const { spec } = c;
    const versioned = spec.concurrency === 'version';
    const name = (what: string) => `${spec.id} · ${what}`;
    if (versioned && !c.currentVersion) {
      checks.push({ id: name('declares version concurrency but has no currentVersion sample — action checks not run'), mode: 'skipped', uses: ['menuAction'], run: async () => null });
      continue;
    }
    // `key: null` omits the key; `version` overrides the freshly read expectedVersion.
    const prepare = (over: { key?: string | null; input?: Record<string, unknown>; scopeId?: string; version?: string } = {}): Promise<MenuAction> =>
      harness.asGranted(async () => {
        const req: MenuAction = {
          action: spec.id,
          context: spec.requiresScope ? { scopeId: over.scopeId ?? harness.context.scopeId } : {},
          input: over.input ?? c.input,
          idempotencyKey: over.key ?? crypto.randomUUID(),
          ...(versioned ? { expectedVersion: over.version ?? await c.currentVersion!() } : {}),
        };
        if (over.key === null) delete (req as Partial<MenuAction>).idempotencyKey;
        return req;
      });
    const sendGranted = (req: MenuAction) => harness.asGranted(() => adapter.menuAction(req));
    const want = (r: ActionResponse<unknown>, outcome: ActionResponse<unknown>['outcome'], why: string): string | null =>
      (r.outcome === outcome ? null : `${why}: expected ${outcome}, got ${describeAction(r)}`);
    const unexpectedInput = { ...c.input, __conformance_unexpected: true };

    checks.push({
      id: name('ok, then the same key and input → the stored answer with replayed: true'),
      mode: 'sequential',
      uses: ['menuAction'],
      run: async () => {
        const req = await prepare();
        const first = await sendGranted(req);
        const bad = want(first, 'ok', 'a granted write');
        if (bad) return bad;
        if (first.replayed !== false) return 'a fresh answer must carry replayed: false';
        // The same request object: a version action keeps its original expectedVersion on replay.
        const again = await sendGranted(req);
        return want(again, 'ok', 'the replay')
          ?? (again.replayed !== true ? 'the replay must carry replayed: true'
            : JSON.stringify(again.data) !== JSON.stringify(first.data) ? 'the replay must return the stored data'
            : null);
      },
    });
    checks.push({
      id: name('the same key with a different input → error'),
      mode: 'sequential',
      uses: ['menuAction'],
      run: async () => {
        const req = await prepare();
        const first = await sendGranted(req);
        const bad = want(first, 'ok', 'a granted write');
        // Replay is judged before input values (checklist §3), so an extra key is a different input a server must refuse as reuse, not as `invalid`.
        return bad ?? want(await sendGranted({ ...req, input: unexpectedInput }), 'error', 'the key reused with another input');
      },
    });
    for (const [what, key] of [['omitted', null], ['empty', ''], ['not a UUID', 'not-a-uuid']] as const) {
      checks.push({
        id: name(`idempotencyKey ${what} → invalid at idempotencyKey`),
        mode: 'sequential',
        uses: ['menuAction'],
        run: async () => {
          const r = await sendGranted(await prepare({ key }));
          const bad = want(r, 'invalid', `a ${what} key`);
          if (bad) return bad;
          return r.fieldErrors?.some(e => e.path.length === 1 && e.path[0] === 'idempotencyKey')
            ? null : 'fieldErrors must name path ["idempotencyKey"]';
        },
      });
    }
    checks.push({
      id: name('an input key outside inputKeys → invalid with unexpected_field'),
      mode: 'sequential',
      uses: ['menuAction'],
      run: async () => {
        const r = await sendGranted(await prepare({ input: unexpectedInput }));
        const bad = want(r, 'invalid', 'an undeclared input key');
        if (bad) return bad;
        return r.fieldErrors?.some(e => e.code === 'unexpected_field' && e.path[0] === '__conformance_unexpected')
          ? null : 'fieldErrors must carry code unexpected_field at the undeclared key';
      },
    });
    if (versioned) {
      checks.push({
        id: name('a stale expectedVersion → conflict with the current version'),
        mode: 'sequential',
        uses: ['menuAction'],
        run: async () => {
          const stale = `${await harness.asGranted(c.currentVersion!)}~conformance-stale`;
          const r = await sendGranted(await prepare({ version: stale }));
          return want(r, 'conflict', 'a version that is not current') ?? (typeof r.version === 'string' ? null : 'a conflict must carry the current version');
        },
      });
    }
    checks.push({
      id: name(`permission precedes replay: without ${spec.permission} the same key → forbidden`),
      mode: 'sequential',
      uses: ['menuAction'],
      run: async () => {
        const req = await prepare();
        const bad = want(await sendGranted(req), 'ok', 'a granted write');
        return bad ?? harness.withoutPermission(spec.permission, async () => want(await adapter.menuAction(req), 'forbidden', 'the stored answer must not reach an actor without the permission'));
      },
    });
    if (spec.requiresScope) {
      checks.push({
        id: name('a site without a grant → forbidden'),
        mode: 'sequential',
        uses: ['menuAction'],
        needsSites: true,
        run: async () => want(await sendGranted(await prepare({ scopeId: harness.foreignScopeId })), 'forbidden', 'a foreign scope'),
      });
    }
    checks.push({
      id: name('an invalid answer is not recorded: the same key then succeeds'),
      mode: 'sequential',
      uses: ['menuAction'],
      run: async () => {
        const key = crypto.randomUUID();
        const bad = want(await sendGranted(await prepare({ key, input: unexpectedInput })), 'invalid', 'an undeclared input key');
        if (bad) return bad;
        const r = await sendGranted(await prepare({ key }));
        return want(r, 'ok', 'the same key with a valid input') ?? (r.replayed ? 'a fresh write after an invalid answer must not be a replay' : null);
      },
    });
    // A Scope-requiring action sends `context.scopeId` in every request (`prepare`), so each check needs a granted site.
    if (spec.requiresScope) for (const check of checks.slice(actionStart)) check.needsSites = true;
  }
  return checks;
}
