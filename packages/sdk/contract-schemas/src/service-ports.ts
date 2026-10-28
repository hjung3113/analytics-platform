import { z } from 'zod/v4';

// Persistence, people and notices port schemas (ADR-0098; schema source boundary ADR-0097). Servers import these at runtime; they
// never keep a second copy. Strict objects reject unknown keys, so a forged identity field (`userId`, `author`, `at`) is refused.
// Not expressible in JSON Schema, enforced here at runtime only: set/remove key overlap, serialized-size bounds, the distinctness of
// `remove`/`ids` entries beyond `uniqueItems`, valid Unicode in strings, the account-wide key total, and the JSON nesting depth of
// every preference value (JSON_MAX_DEPTH): a consumer using the JSON artifacts alone must enforce these itself.

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Same limits as `PREFERENCE_*` / `PEOPLE_LOOKUP_MAX` in @ap/contracts (this package never imports it; a test compares them). */
export const PREFERENCE_KEYS_MAX = 200;
export const PREFERENCE_VALUE_MAX_BYTES = 65_536;
export const PREFERENCE_REQUEST_MAX_BYTES = 262_144;
export const PEOPLE_LOOKUP_MAX = 200;
export const PREFERENCE_KEY_SOURCE = '^(?:favorites|recents|lastScope|lang|columns:[A-Za-z0-9_.-]{1,100})$';

/** UTF-8 byte length of the JSON text of a value (a lone surrogate counts as its 3-byte replacement). */
export function jsonBytes(value: unknown): number {
  const text = JSON.stringify(value) ?? '';
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** Nesting limit of a JSON value: the root is depth 0 and no value, scalar leaves included, sits deeper than 32 (ADR-0098 §1). */
const JSON_MAX_DEPTH = 32;

/** True when no container is nested deeper than JSON_MAX_DEPTH. Iterative, so a hostile input cannot overflow the stack, and it stops at the first violation. */
function withinJsonDepth(value: unknown): boolean {
  const pending: [unknown, number][] = [[value, 0]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [node, depth] = next;
    if (depth > JSON_MAX_DEPTH) return false;
    if (typeof node !== 'object' || node === null) continue;
    for (const child of Array.isArray(node) ? node : Object.values(node)) pending.push([child, depth + 1]);
  }
  return true;
}

const jsonStructure: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(jsonStructure), z.record(z.string(), jsonStructure)]),
);

/**
 * Any JSON value, recursively, nested at most JSON_MAX_DEPTH deep. Numbers are finite (Zod rejects NaN and Infinity). The depth
 * is checked before the recursive parse (`abort: true` is what stops the pipe: a plain refine issue would not), so an over-deep input is rejected, never parsed into a stack overflow. The depth bound is
 * a runtime-only rule: the JSON artifacts keep the unbounded recursive `$ref`, so a consumer validating with them alone must
 * apply it itself.
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.unknown().refine(withinJsonDepth, { message: `nested at most ${JSON_MAX_DEPTH} deep`, abort: true }).pipe(jsonStructure);

export const preferenceKeySchema = z.string().regex(new RegExp(PREFERENCE_KEY_SOURCE));

const valueMap = z
  .record(preferenceKeySchema, jsonValueSchema)
  .refine((values) => Object.keys(values).length <= PREFERENCE_KEYS_MAX, { message: `at most ${PREFERENCE_KEYS_MAX} keys` })
  .refine((values) => Object.values(values).every((value) => jsonBytes(value) <= PREFERENCE_VALUE_MAX_BYTES), { message: `each value at most ${PREFERENCE_VALUE_MAX_BYTES} bytes` })
  .meta({ maxProperties: PREFERENCE_KEYS_MAX });

const distinct = <T extends z.ZodType<string[]>>(list: T) =>
  list.refine((values) => new Set(values).size === values.length, { message: 'entries must be distinct' }).meta({ uniqueItems: true });

const instant = z.string().datetime({ offset: true });
/** Naive wall-clock `YYYY-MM-DDTHH:mm:ss` like the Home notice `until` (06 §6.3). Calendar validity is a runtime check on the server. */
const wallClock = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);

/** The session user's preferences. `importedAt` is the import commit instant, null before. */
export const preferencesSnapshotSchema = z.strictObject({ values: valueMap, importedAt: instant.nullable() });

export const preferencesPatchSchema = z
  .strictObject({ set: valueMap.optional(), remove: distinct(z.array(preferenceKeySchema).max(PREFERENCE_KEYS_MAX)).optional() })
  .refine((patch) => !(patch.remove ?? []).some((key) => patch.set !== undefined && Object.hasOwn(patch.set, key)), { message: 'set and remove must not share a key' })
  .refine((patch) => jsonBytes(patch) <= PREFERENCE_REQUEST_MAX_BYTES, { message: `request at most ${PREFERENCE_REQUEST_MAX_BYTES} bytes` });

export const preferencesImportSchema = z
  .strictObject({ values: valueMap })
  .refine((input) => jsonBytes(input) <= PREFERENCE_REQUEST_MAX_BYTES, { message: `request at most ${PREFERENCE_REQUEST_MAX_BYTES} bytes` });

/** Opaque ids: non-empty, no size promise about their shape. At most PEOPLE_LOOKUP_MAX, distinct. */
export const peopleLookupRequestSchema = z.strictObject({ ids: distinct(z.array(z.string().min(1)).max(PEOPLE_LOOKUP_MAX)) });

/** Existing saved-view vocabulary (`GroupMember`); no console role or grant data. */
export const groupMemberSchema = z.strictObject({ userId: z.string(), displayName: z.string(), affiliation: z.string() });
export const peopleLookupResponseSchema = z.strictObject({ items: z.array(groupMemberSchema) });

const text = (max: number) => z.strictObject({ ko: z.string().max(max), en: z.string().max(max) });
const title = text(200);
const content = text(10_000);

export const noticeSchema = z.strictObject({
  id: z.string().min(1),
  title,
  content,
  scopeId: z.string().nullable(),
  until: wallClock,
  version: z.string().min(1),
});
export const noticeListPageSchema = z.strictObject({ items: z.array(noticeSchema) });

const noticeDraft = { title, content, scopeId: z.string().nullable(), until: wallClock };
const idempotencyKey = z.string().min(1).max(200);
export const createNoticeInputSchema = z.strictObject({ ...noticeDraft, idempotencyKey });
export const updateNoticeInputSchema = z.strictObject({ ...noticeDraft, id: z.string().min(1), expectedVersion: z.string().min(1), idempotencyKey });
export const saveNoticeInputSchema = z.union([createNoticeInputSchema, updateNoticeInputSchema]);
export const deleteNoticeInputSchema = z.strictObject({ id: z.string().min(1), expectedVersion: z.string().min(1), idempotencyKey });
