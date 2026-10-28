import type { ActionResponse, ApiResponse, CreateNoticeInput, Notice, PreferencesSnapshot } from '@ap/contracts';
import type { ConformanceCheck, PortMethod, ServerConformanceHarness } from '../../types';
import { CONSOLE_ACCESS, assessmentProblem, describeAction, describeResponse, missingEnvelopeKey } from '../../helpers';

/** Each preference check reads back what it wrote, so every one declares the three preference methods. */
const PREFERENCES: readonly PortMethod[] = ['readPreferences', 'patchPreferences', 'importPreferences'];
const NOTICES: readonly PortMethod[] = ['listNotices', 'saveNotice', 'deleteNotice'];
const MEMBER_KEYS = ['affiliation', 'displayName', 'userId'];
/** A key in the preference grammar that no earlier run wrote (columns:<preferenceKey>, ADR-0098). */
const freshKey = () => `columns:conformance-${crypto.randomUUID()}`;
const text = { ko: '적합성', en: 'Conformance' };
const draft = (): Omit<CreateNoticeInput, 'idempotencyKey'> => ({ title: text, content: text, scopeId: null, until: '2099-01-01T00:00:00' });

/**
 * Preferences, people lookup and notices (ADR-0098). Server-owned per-user state: the granted actor and a second user
 * must not see each other's keys, an import never overwrites a server value, and a notice write needs `console:access`,
 * the version and a replay-safe key. Methods a server has not built yet are listed out of `implemented` and show as skipped.
 */
export function planServiceChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter } = harness;
  const checks: ConformanceCheck[] = [];
  const snapshotProblem = (r: ApiResponse<PreferencesSnapshot>, name: string): string | null => {
    if (r.outcome !== 'ok') return `${name}: expected ok, got ${describeResponse(r)}`;
    const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
    if (missing) return `${name}: ${missing}`;
    if (r.trust !== null || r.assessments.length > 0) return `${name}: preferences are not mart data — trust null, assessments []`;
    if (r.data === null || typeof r.data.values !== 'object' || r.data.values === null || Array.isArray(r.data.values)) return `${name}: data.values is an object`;
    if (r.data.importedAt !== null && typeof r.data.importedAt !== 'string') return `${name}: data.importedAt is a string or null`;
    return assessmentProblem(r.assessments, r.outcome);
  };

  checks.push({
    id: 'port · patchPreferences stores, merges and removes keys; null is a value',
    uses: PREFERENCES,
    mode: 'granted',
    run: async () => {
      const [a, b] = [freshKey(), freshKey()];
      const first = await adapter.patchPreferences({ set: { [a]: { n: [1, 'x', null] }, [b]: null } });
      const bad = snapshotProblem(first, 'patchPreferences');
      if (bad) return bad;
      const merged = await adapter.patchPreferences({ remove: [b], set: { lang: 'ko' } });
      const mergedBad = snapshotProblem(merged, 'patchPreferences (merge)');
      if (mergedBad) return mergedBad;
      const read = await adapter.readPreferences();
      const readBad = snapshotProblem(read, 'readPreferences');
      if (readBad) return readBad;
      const values = read.data!.values;
      if (JSON.stringify(values[a]) !== JSON.stringify({ n: [1, 'x', null] })) return 'a later patch overwrote a key it did not name — writes patch keys, never the whole account';
      if (Object.hasOwn(values, b)) return 'remove did not delete the key';
      if (values['lang'] !== 'ko') return 'set did not store the value';
      const stored = await adapter.patchPreferences({ set: { [b]: null } });
      if (stored.outcome !== 'ok' || stored.data?.values[b] !== null) return 'null must be stored as null, not treated as remove';
      return null;
    },
  });
  checks.push({
    id: 'port · patchPreferences rejects overlapping set/remove, bad keys and a forged identity, and writes nothing',
    uses: PREFERENCES,
    mode: 'granted',
    run: async () => {
      const key = freshKey();
      const attempts: [string, unknown][] = [
        ['a key in both set and remove', { set: { [key]: 1 }, remove: [key] }],
        ['a key outside the grammar', { set: { 'favorites:someone-else': 1 } }],
        ['a client identity field', { userId: 'someone-else', set: { [key]: 1 } }],
      ];
      for (const [name, patch] of attempts) {
        const r = await adapter.patchPreferences(patch as never);
        if (r.outcome === 'ok') return `${name}: expected a rejection, got ok`;
        if (r.data !== null) return `${name}: a rejection carries no data`;
      }
      const read = await adapter.readPreferences();
      if (read.outcome === 'ok' && Object.hasOwn(read.data!.values, key)) return 'a rejected patch still wrote a key';
      return null;
    },
  });
  checks.push({
    id: 'port · importPreferences keeps server values, saves missing keys once, and is a no-op afterwards',
    uses: PREFERENCES,
    mode: 'granted',
    run: async () => {
      const before = await adapter.readPreferences();
      const beforeBad = snapshotProblem(before, 'readPreferences');
      if (beforeBad) return beforeBad;
      const [held, missing] = [freshKey(), freshKey()];
      const seeded = await adapter.patchPreferences({ set: { [held]: 'server' } });
      if (seeded.outcome !== 'ok') return `patchPreferences: expected ok, got ${describeResponse(seeded)}`;
      const done = await adapter.importPreferences({ values: { [held]: 'browser', [missing]: 'browser' } });
      const doneBad = snapshotProblem(done, 'importPreferences');
      if (doneBad) return doneBad;
      if (done.data!.importedAt === null) return 'the acknowledgement is importedAt !== null after the commit';
      if (done.data!.values[held] !== 'server') return 'import overwrote a key the server already holds — the server value wins';
      const added = Object.hasOwn(done.data!.values, missing);
      if (before.data!.importedAt === null && !added) return 'the first import dropped a missing key';
      if (before.data!.importedAt !== null && added) return 'an import after completion changed data — it is a permanent no-op';
      const late = freshKey();
      const again = await adapter.importPreferences({ values: { [late]: 'browser' } });
      if (again.outcome !== 'ok') return `a repeated import: expected ok, got ${describeResponse(again)}`;
      if (Object.hasOwn(again.data!.values, late)) return 'a second import saved a key — after completion it must not resurrect or add keys';
      if (again.data!.importedAt !== done.data!.importedAt) return 'the completion instant must not move on a repeated import';
      const bad = await adapter.importPreferences({ values: { [late]: 1 }, userId: 'someone-else' } as never);
      if (bad.outcome === 'ok') return 'an import carrying an identity field must be rejected';
      return null;
    },
  });
  checks.push({
    id: 'port · preferences are per session user: a second user neither reads nor is changed by them',
    uses: PREFERENCES,
    mode: 'sequential',
    run: async () => {
      const key = freshKey();
      const written = await harness.asGranted(() => adapter.patchPreferences({ set: { [key]: 'granted' } }));
      if (written.outcome !== 'ok') return `patchPreferences: expected ok, got ${describeResponse(written)}`;
      const other = await harness.asOtherAnnotator(() => adapter.readPreferences());
      if (other.outcome !== 'ok') return `the second user's readPreferences: expected ok, got ${describeResponse(other)}`;
      if (Object.hasOwn(other.data!.values, key)) return "the second user reads the granted user's key — preferences are per authenticated user";
      await harness.asOtherAnnotator(() => adapter.patchPreferences({ set: { [key]: 'other' } }));
      const back = await harness.asGranted(() => adapter.readPreferences());
      if (back.outcome !== 'ok' || back.data!.values[key] !== 'granted') return "the second user's write changed the granted user's value";
      return null;
    },
  });

  checks.push({
    id: 'port · lookupPeople answers exact ids with GroupMember fields only; unknown ids are absent',
    uses: ['session', 'lookupPeople'],
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const own = adapter.session().user.id;
      const found = await adapter.lookupPeople([own, '__conformance_unknown_person']);
      if (!Array.isArray(found)) return `lookupPeople answers an array, got ${typeof found}`;
      if (found.some(p => p.userId === '__conformance_unknown_person')) return 'an unknown id must be absent, not echoed as a placeholder';
      for (const person of found) {
        if (JSON.stringify(Object.keys(person).sort()) !== JSON.stringify(MEMBER_KEYS)) return `a person carries ${Object.keys(person).join(', ')} — exactly userId, displayName, affiliation (no role or grant data)`;
        if (![person.userId, person.displayName, person.affiliation].every(v => typeof v === 'string')) return 'every GroupMember field is a string';
        if (person.userId !== own) return `asked for ${own} only, got ${person.userId} — an exact lookup is not a search`;
      }
      if ((await adapter.lookupPeople([])).length !== 0) return 'an empty id list answers an empty list';
      // The shape checks above also pass for a port that always answers []: only a person the session can really see proves a lookup.
      const visible = harness.ports.visiblePersonId;
      if (visible === undefined) return { skipped: 'ports.visiblePersonId is not provided: no known visible person to look up, so an always-empty lookupPeople cannot be told apart from a working one' };
      const asked = await adapter.lookupPeople([visible, '__conformance_unknown_person']);
      if (!Array.isArray(asked)) return `lookupPeople answers an array, got ${typeof asked}`;
      const row = asked.find(p => p.userId === visible);
      if (!row) return `asked for the visible person ${visible}, got ${asked.length === 0 ? 'no rows' : asked.map(p => p.userId).join(', ')} — a visible id must be returned`;
      if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(MEMBER_KEYS) || ![row.displayName, row.affiliation].every(v => typeof v === 'string')) return `the visible person carries ${Object.keys(row).join(', ')} — exactly userId, displayName, affiliation, all strings`;
      if (asked.length !== 1) return `asked for ${visible} and an unknown id, got ${asked.length} rows — only the visible person is returned`;
      return null;
    },
  });

  const noticeProblem = (r: ActionResponse<Notice>, name: string): string | null => {
    if (r.outcome !== 'ok') return `${name}: expected ok, got ${describeAction(r)}`;
    const n = r.data;
    if (n === null || typeof n.id !== 'string' || typeof n.version !== 'string' || n.id === '') return `${name}: the ok answer carries the stored notice with a server id and version`;
    if (r.version !== n.version) return `${name}: the answer's version is the notice's version after the write`;
    return null;
  };
  checks.push({
    id: 'port · notices: create, update under the version, stale update conflicts, delete, delete again not_found',
    uses: NOTICES,
    mode: 'console',
    run: async () => {
      const created = await adapter.saveNotice({ ...draft(), idempotencyKey: crypto.randomUUID() });
      const createdBad = noticeProblem(created, 'saveNotice (create)');
      if (createdBad) return createdBad;
      const notice = created.data!;
      const listed = await adapter.listNotices();
      const listMissing = missingEnvelopeKey(listed, 'assessments') ?? missingEnvelopeKey(listed, 'trust');
      if (listMissing) return `listNotices: ${listMissing}`;
      if (listed.outcome !== 'ok' || !listed.data?.items.some(item => item.id === notice.id)) return 'listNotices does not return the notice just created';
      if (listed.trust !== null || listed.assessments.length > 0) return 'listNotices is not mart data — trust null, assessments []';
      const updated = await adapter.saveNotice({ ...draft(), title: { ko: '수정', en: 'Edited' }, id: notice.id, expectedVersion: notice.version, idempotencyKey: crypto.randomUUID() });
      const updatedBad = noticeProblem(updated, 'saveNotice (update)');
      if (updatedBad) return updatedBad;
      if (updated.data!.version === notice.version) return 'an update must advance the version';
      const stale = await adapter.saveNotice({ ...draft(), id: notice.id, expectedVersion: notice.version, idempotencyKey: crypto.randomUUID() });
      if (stale.outcome !== 'conflict') return `an update under a stale version: expected conflict, got ${describeAction(stale)}`;
      if (stale.version !== updated.data!.version) return 'a conflict answers the current version';
      const gone = await adapter.deleteNotice({ id: notice.id, expectedVersion: updated.data!.version, idempotencyKey: crypto.randomUUID() });
      if (gone.outcome !== 'ok' || gone.data?.id !== notice.id) return `deleteNotice: expected ok with the id, got ${describeAction(gone)}`;
      const again = await adapter.deleteNotice({ id: notice.id, expectedVersion: updated.data!.version, idempotencyKey: crypto.randomUUID() });
      if (again.outcome !== 'not_found') return `deleting a deleted notice: expected not_found, got ${describeAction(again)}`;
      return null;
    },
  });
  checks.push({
    id: 'port · saveNotice with the same idempotency key replays without a second write',
    uses: NOTICES,
    mode: 'console',
    run: async () => {
      const input = { ...draft(), idempotencyKey: crypto.randomUUID() };
      const first = await adapter.saveNotice(input);
      const firstBad = noticeProblem(first, 'saveNotice');
      if (firstBad) return firstBad;
      const retry = await adapter.saveNotice(input);
      if (retry.outcome !== 'ok' || retry.replayed !== true) return `a retry with the same key: expected ok with replayed true, got ${describeAction(retry)}`;
      if (retry.data?.id !== first.data!.id) return 'a replay answers the first notice, not a second one';
      const listed = await adapter.listNotices();
      if (listed.data?.items.filter(item => item.id === first.data!.id).length !== 1) return 'a replay created a second row';
      await adapter.deleteNotice({ id: first.data!.id, expectedVersion: first.data!.version, idempotencyKey: crypto.randomUUID() });
      return null;
    },
  });
  checks.push({
    id: 'port · saveNotice rejects a supplied author, id on create and unknown keys',
    uses: NOTICES,
    mode: 'console',
    run: async () => {
      for (const extra of [{ author: 'someone-else' }, { createdAt: '2026-10-28T00:00:00Z' }, { version: 'v9' }]) {
        const r = await adapter.saveNotice({ ...draft(), idempotencyKey: crypto.randomUUID(), ...extra } as never);
        if (r.outcome === 'ok') return `a create carrying ${Object.keys(extra)[0]} must be rejected (the server stamps identity and times)`;
        if (r.data !== null) return 'a rejected write carries no data';
      }
      return null;
    },
  });
  for (const [method, send] of [
    ['saveNotice', () => adapter.saveNotice({ ...draft(), idempotencyKey: crypto.randomUUID() })],
    ['deleteNotice', () => adapter.deleteNotice({ id: 'conformance-none', expectedVersion: 'v1', idempotencyKey: crypto.randomUUID() })],
  ] as const) {
    checks.push({
      id: `port · ${method} without console:access → forbidden`,
      uses: [method],
      mode: 'permission',
      run: () => harness.withoutPermission(CONSOLE_ACCESS, async () => {
        const r = await send();
        return r.outcome === 'forbidden' ? null : `${method} requires ${CONSOLE_ACCESS}: expected forbidden, got ${describeAction(r)}`;
      }),
    });
  }
  return checks;
}
