import type { Text } from '../i18n.js';
import type { JsonValue } from '../links/saved-view.js';

/**
 * Persistence, people and notices ports of `PlatformAdapter` (ADR-0098). Wire shapes only: the runtime schemas live in
 * `@ap/contract-schemas`, which `equivalence.test.ts` proves equal to these types.
 */

/** Preference key grammar (ADR-0098): `favorites`, `recents`, `lastScope`, `lang`, or `columns:<preferenceKey>`. Never carries an account id. */
export const PREFERENCE_KEY_PATTERN = /^(?:favorites|recents|lastScope|lang|columns:[A-Za-z0-9_.-]{1,100})$/;
/** At most this many keys per patch/import request and per account. */
export const PREFERENCE_KEYS_MAX = 200;
/** Serialized JSON bytes (UTF-8) of one value / of a whole request body. */
export const PREFERENCE_VALUE_MAX_BYTES = 65_536;
export const PREFERENCE_REQUEST_MAX_BYTES = 262_144;
/** At most this many ids per `lookupPeople` call. */
export const PEOPLE_LOOKUP_MAX = 200;

/** The session user's preferences. `importedAt` is the commit time (instant) of the one-time import, null before. */
export type PreferencesSnapshot = { values: Record<string, JsonValue>; importedAt: string | null };
/** `set` and `remove` must not share a key. */
export type PreferencesPatch = { set?: Record<string, JsonValue>; remove?: readonly string[] };
/** Browser-held values offered once for the session user; the server keeps its own value for any key it already holds. */
export type PreferencesImport = { values: Record<string, JsonValue> };

/** A platform notice. Home fields (`id`, `title`, `scopeId`, `until`) plus `content` and the optimistic `version`. */
export type Notice = { id: string; title: Text; content: Text; scopeId: string | null; until: string; version: string };
export type NoticeListPage = { items: readonly Notice[] };
export type NoticeDraft = { title: Text; content: Text; scopeId: string | null; until: string };
/** Create: no id. The server mints id, author and times. */
export type CreateNoticeInput = NoticeDraft & { idempotencyKey: string };
/** Update: id plus the version the edit started from. */
export type UpdateNoticeInput = NoticeDraft & { id: string; expectedVersion: string; idempotencyKey: string };
export type SaveNoticeInput = CreateNoticeInput | UpdateNoticeInput;
export type DeleteNoticeInput = { id: string; expectedVersion: string; idempotencyKey: string };
