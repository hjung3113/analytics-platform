// The one builder for API paths that carry a value in a path segment.
//
// Invariant: a path segment is never taken from a URL or a response without validation.
// - A plain interpolated value is a resource id and must be a UUID; anything else throws
//   `ApiPathError` before any request is made.
// - A segment that is not a UUID (an opaque token, an action name) is wrapped in `segment()`:
//   it goes through `encodeURIComponent` and an empty, `.` or `..` value throws.
// The thrown error never carries the rejected value.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown before a request when a path value fails validation. `kind` says which rule failed. */
export class ApiPathError extends Error {
  constructor(readonly kind: 'id' | 'segment') {
    super(kind === 'id' ? 'API path id is not a UUID' : 'API path segment is not allowed');
    this.name = 'ApiPathError';
  }
}

const encoded = Symbol('apiPathSegment');

/** A path value that is not a UUID id, already checked and encoded. Build it with {@link segment}. */
export interface ApiPathSegment {
  readonly [encoded]: string;
}

/** A non-id path segment: rejected when empty, `.` or `..`, otherwise `encodeURIComponent`-encoded. */
export function segment(value: string): ApiPathSegment {
  if (typeof value !== 'string' || value === '' || value === '.' || value === '..') throw new ApiPathError('segment');
  return { [encoded]: encodeURIComponent(value) };
}

/** Whether `value` is a UUID (any version, case-insensitive) — the shape every path id must have. */
export function isApiPathId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Tagged template for an API path: `` apiPath`/tasks/${id}/comments` ``. Each plain string value must be a UUID id;
 * other segments are passed as `segment(value)`. Throws {@link ApiPathError} before any request when a value fails.
 */
export function apiPath(
  strings: TemplateStringsArray,
  ...values: readonly (string | ApiPathSegment)[]
): string {
  let out = strings[0] ?? '';
  values.forEach((value, index) => {
    if (typeof value === 'string') {
      if (!isApiPathId(value)) throw new ApiPathError('id');
      out += value;
    } else if (typeof value === 'object' && value !== null && typeof value[encoded] === 'string') {
      out += value[encoded];
    } else {
      // A response value is not type-checked at runtime by unparsed reads: anything that is neither a UUID string nor a
      // `segment()` result (a number, null, an object) must stop here, before a request.
      throw new ApiPathError('id');
    }
    out += strings[index + 1] ?? '';
  });
  return out;
}

/**
 * A detail-response parser that also requires the response `id` to equal the requested `id` (case-insensitive):
 * a detail that answers for another resource is a parse error (`ApiParseError` with issue path `id`).
 */
export function withRequestedId<T extends { id: string }>(
  parser: { parse(data: unknown): T },
  id: string,
): (data: unknown) => T {
  return (data) => {
    const parsed = parser.parse(data);
    if (parsed.id.toLowerCase() !== id.toLowerCase()) {
      throw Object.assign(new Error('response id differs from the requested id'), {
        issues: [{ path: ['id'], code: 'custom' }],
      });
    }
    return parsed;
  };
}
