// Request judgment of `saveNotice` / `deleteNotice` that needs no database (ADR-0098 §4,
// real-server-checklist notice rows): strict shared schemas, the checks a schema cannot express
// (NUL, lone surrogates, a real calendar date, a UUID key), the one authoring restriction this
// server has (no authoritative site grants, so `scopeId` must be null) and the consistency of the
// `Idempotency-Key` / `If-Match` headers with the body. Pure: the permission, replay and version
// judgments that need the database come after it (service.ts).

import {
  createNoticeInputSchema,
  deleteNoticeInputSchema,
  updateNoticeInputSchema,
} from '@ap/contract-schemas';

import { unsafeText } from '../platform-port/text-safety.js';
import type { FieldError, NoticeDraft } from './types.js';

export type NoticeOperation = 'save' | 'delete';

export type ParsedNoticeWrite =
  | { kind: 'create'; idempotencyKey: string; draft: NoticeDraft }
  | {
      kind: 'update';
      idempotencyKey: string;
      id: string;
      expectedVersion: string;
      draft: NoticeDraft;
    }
  | { kind: 'delete'; idempotencyKey: string; id: string; expectedVersion: string };

export type NoticeWriteJudgment =
  | { ok: true; input: ParsedNoticeWrite; fingerprintInput: Record<string, unknown> }
  | { ok: false; outcome: 'invalid' | 'error'; fieldErrors: FieldError[]; message: string };

export interface NoticeWriteHeaders {
  idempotencyKey?: string | string[] | undefined;
  ifMatch?: string | string[] | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A real Gregorian date and a time of day without a leap second, from year 0001 (Postgres has no year 0). */
export function isRealWallClock(value: string): boolean {
  const m = WALL_CLOCK.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (year < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(Date.UTC(2000, month - 1, 1));
  date.setUTCFullYear(year);
  if (month < 1 || month > 12) return false;
  date.setUTCMonth(month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const valueAt = (root: unknown, path: ReadonlyArray<PropertyKey>): unknown => {
  let current: unknown = root;
  for (const step of path) {
    if (!isPlain(current)) return undefined;
    current = current[step as string];
  }
  return current;
};

/** Maps the shared schema's issues to the port's `FieldError` vocabulary. */
function schemaErrors(
  issues: ReadonlyArray<{ code: string; path: ReadonlyArray<PropertyKey>; keys?: string[] }>,
  body: unknown,
): FieldError[] {
  const errors: FieldError[] = [];
  for (const issue of issues) {
    const path = issue.path.map(String);
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys ?? [])
        errors.push({ path: [...path, key], code: 'unknown_key' });
    } else if (valueAt(body, issue.path) === undefined) {
      errors.push({ path, code: 'required' });
    } else {
      errors.push({ path, code: 'invalid' });
    }
  }
  return errors;
}

function contentErrors(draft: NoticeDraft): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of ['title', 'content'] as const) {
    for (const lang of ['ko', 'en'] as const) {
      if (unsafeText(draft[field][lang])) errors.push({ path: [field, lang], code: 'invalid' });
    }
  }
  // No server-known site grants exist (Core advertises `scopes: []`), so only a global notice can be
  // authored; reopen when the server supplies authoritative grants (ADR-0098 runtime status).
  if (draft.scopeId !== null) errors.push({ path: ['scopeId'], code: 'unknown_scope' });
  if (!isRealWallClock(draft.until)) errors.push({ path: ['until'], code: 'invalid' });
  return errors;
}

const single = (header: string | string[] | undefined): string | undefined =>
  typeof header === 'string' ? header : undefined;

export function parseNoticeWrite(
  operation: NoticeOperation,
  body: unknown,
  headers: NoticeWriteHeaders,
): NoticeWriteJudgment {
  const invalid = (fieldErrors: FieldError[]): NoticeWriteJudgment => ({
    ok: false,
    outcome: 'invalid',
    fieldErrors,
    message: 'Invalid notice request',
  });
  if (!isPlain(body)) return invalid([{ path: [], code: 'malformed' }]);

  const isUpdate =
    operation === 'save' && (Object.hasOwn(body, 'id') || Object.hasOwn(body, 'expectedVersion'));
  const schema =
    operation === 'delete'
      ? deleteNoticeInputSchema
      : isUpdate
        ? updateNoticeInputSchema
        : createNoticeInputSchema;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalid(schemaErrors(parsed.error.issues, body));

  const data = parsed.data as Record<string, unknown> & { idempotencyKey: string };
  const { idempotencyKey, ...rest } = data;
  const errors: FieldError[] = [];
  if (!isUuid(idempotencyKey)) errors.push({ path: ['idempotencyKey'], code: 'invalid' });
  if (operation === 'save') errors.push(...contentErrors(rest as unknown as NoticeDraft));
  if (errors.length > 0) return invalid(errors);

  const headerKey = single(headers.idempotencyKey);
  if (headerKey === undefined || !isUuid(headerKey))
    return invalid([{ path: ['idempotencyKey'], code: 'invalid' }]);
  const mismatch = (message: string): NoticeWriteJudgment => ({
    ok: false,
    outcome: 'error',
    fieldErrors: [],
    message,
  });
  if (headerKey !== idempotencyKey)
    return mismatch('Idempotency-Key header does not match the body');

  const expectedVersion =
    typeof rest.expectedVersion === 'string' ? rest.expectedVersion : undefined;
  const ifMatch = single(headers.ifMatch);
  if (headers.ifMatch !== undefined && ifMatch === undefined)
    return mismatch('If-Match header is malformed');
  if (ifMatch !== expectedVersion)
    return mismatch('If-Match header does not match expectedVersion');

  if (operation === 'delete') {
    return {
      ok: true,
      input: {
        kind: 'delete',
        idempotencyKey,
        id: rest.id as string,
        expectedVersion: expectedVersion as string,
      },
      fingerprintInput: rest,
    };
  }
  const draft: NoticeDraft = {
    title: rest.title as NoticeDraft['title'],
    content: rest.content as NoticeDraft['content'],
    scopeId: rest.scopeId as string | null,
    until: rest.until as string,
  };
  if (isUpdate) {
    return {
      ok: true,
      input: {
        kind: 'update',
        idempotencyKey,
        id: rest.id as string,
        expectedVersion: expectedVersion as string,
        draft,
      },
      fingerprintInput: rest,
    };
  }
  return { ok: true, input: { kind: 'create', idempotencyKey, draft }, fingerprintInput: rest };
}
