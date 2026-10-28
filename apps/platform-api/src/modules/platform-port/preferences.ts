// Platform port `readPreferences` / `patchPreferences` / `importPreferences` (ADR-0098). The session user's preferences live in
// one `platform.preferences` row per (workspace, actor). Wire validation is the shared @ap/contract-schemas source (ADR-0097);
// this module adds only what a schema cannot know: the stored state. Every write runs in one transaction that first
// materialises the row and then locks it, so concurrent first writes, an import and a patch serialise on that row and the
// account-wide key cap holds.

import {
  PREFERENCE_KEYS_MAX,
  preferencesImportSchema,
  preferencesPatchSchema,
} from '@ap/contract-schemas';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { preferences } from '../../db/schema/platform-preferences.js';
import type { Outcome } from './envelope.js';
import type { PlatformActor } from './permissions.js';

export interface PreferencesSnapshotData {
  values: Record<string, unknown>;
  importedAt: string | null;
}

export interface PreferencesJudgement {
  outcome: Outcome;
  data?: PreferencesSnapshotData;
  message?: string;
}

/** The size messages of the shared schemas (and Zod's own `too_big`): a rejection made only of these is `too_large`, else `error`. */
const SIZE_MESSAGE =
  /^(?:at most \d+ keys|each value at most \d+ bytes|request at most \d+ bytes)$/;

interface Issue {
  code: string;
  message: string;
}

function rejection(issues: readonly Issue[]): PreferencesJudgement {
  const oversize = issues.every((i) => i.code === 'too_big' || SIZE_MESSAGE.test(i.message));
  return oversize
    ? { outcome: 'too_large', message: 'Preferences request exceeds the allowed size' }
    : { outcome: 'error', message: 'Invalid preferences request' };
}

const tooManyKeys = (): PreferencesJudgement => ({
  outcome: 'too_large',
  message: `A user holds at most ${PREFERENCE_KEYS_MAX} preference keys`,
});

/** An UTF-16 surrogate without its partner: JSON text can spell one (`"\ud800"`), but `jsonb` cannot store it. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** Postgres `jsonb` cannot store U+0000 or a lone surrogate in a string or an object key; refuse it before the write instead of failing the transaction. */
function unstorable(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('\u0000') || LONE_SURROGATE.test(value);
  if (Array.isArray(value)) return value.some(unstorable);
  if (value !== null && typeof value === 'object')
    return Object.entries(value).some(([k, v]) => unstorable(k) || unstorable(v));
  return false;
}

const unstorableRejected = (): PreferencesJudgement => ({
  outcome: 'error',
  message: 'Invalid preferences request',
});

export function createPlatformPreferencesService(deps: { db: Db }) {
  const { db } = deps;
  type Handle = Pick<Db, 'select' | 'insert' | 'update'>;

  const snapshotOf = (row: { values: Record<string, unknown>; importedAt: Date | null }) => ({
    outcome: 'ok' as const,
    data: { values: row.values, importedAt: row.importedAt?.toISOString() ?? null },
  });

  /** The actor's row, locked for the rest of the transaction; created empty on first use. */
  async function lockRow(tx: Handle, actor: PlatformActor) {
    await tx
      .insert(preferences)
      .values({ workspaceId: actor.workspace_id, actorId: actor.actor_id })
      .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(preferences)
      .where(
        and(
          eq(preferences.workspaceId, actor.workspace_id),
          eq(preferences.actorId, actor.actor_id),
        ),
      )
      .for('update');
    if (!row) throw new Error('preferences row missing after insert');
    return row;
  }

  const save = (tx: Handle, actor: PlatformActor, set: Partial<typeof preferences.$inferInsert>) =>
    tx
      .update(preferences)
      .set({ ...set, updatedAt: sql`now()` })
      .where(
        and(
          eq(preferences.workspaceId, actor.workspace_id),
          eq(preferences.actorId, actor.actor_id),
        ),
      );

  return {
    async read(actor: PlatformActor): Promise<PreferencesJudgement> {
      const [row] = await db
        .select()
        .from(preferences)
        .where(
          and(
            eq(preferences.workspaceId, actor.workspace_id),
            eq(preferences.actorId, actor.actor_id),
          ),
        );
      return snapshotOf(row ?? { values: {}, importedAt: null });
    },

    /** Mutates the named keys only and never stamps `importedAt`. */
    async patch(actor: PlatformActor, body: unknown): Promise<PreferencesJudgement> {
      const parsed = preferencesPatchSchema.safeParse(body);
      if (!parsed.success) return rejection(parsed.error.issues);
      const { set = {}, remove = [] } = parsed.data;
      if (unstorable(set)) return unstorableRejected();
      return db.transaction(async (tx) => {
        const row = await lockRow(tx, actor);
        const values = { ...row.values };
        for (const key of remove) delete values[key];
        Object.assign(values, set);
        if (Object.keys(values).length > PREFERENCE_KEYS_MAX) return tooManyKeys();
        await save(tx, actor, { values });
        return snapshotOf({ values, importedAt: row.importedAt });
      });
    },

    /** Saves the keys the server does not hold and stamps `importedAt`, once; afterwards (deleted keys included) a no-op. */
    async import(actor: PlatformActor, body: unknown): Promise<PreferencesJudgement> {
      const parsed = preferencesImportSchema.safeParse(body);
      if (!parsed.success) return rejection(parsed.error.issues);
      if (unstorable(parsed.data.values)) return unstorableRejected();
      return db.transaction(async (tx) => {
        const row = await lockRow(tx, actor);
        if (row.importedAt) return snapshotOf(row);
        const values = { ...parsed.data.values, ...row.values };
        if (Object.keys(values).length > PREFERENCE_KEYS_MAX) return tooManyKeys();
        const importedAt = new Date();
        await save(tx, actor, { values, importedAt });
        return snapshotOf({ values, importedAt });
      });
    },
  };
}

export type PlatformPreferencesService = ReturnType<typeof createPlatformPreferencesService>;
