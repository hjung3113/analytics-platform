// Router-free home of the search validation pieces the VOC, Task, Findings and 연동 search schemas need (the recovery queue fields included). The
// bridge entry graph bans `lib/router/**`, so they live here and `lib/router/{search,recovery-search}.ts` re-export them.
import { recoveryCategorySchema } from '@fops/shared';
import { z } from 'zod';

/** Keeps valid route-search fields and drops invalid or unrecognized URL values. */
export function parseRouteSearch<Schema extends z.AnyZodObject>(
  schema: Schema,
  raw: unknown,
): z.infer<Schema> {
  const source =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const candidate: Record<string, unknown> = {};

  const fields = Object.entries(schema.shape) as [string, z.ZodTypeAny][];
  for (const [key, fieldSchema] of fields) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (fieldSchema.safeParse(source[key]).success) candidate[key] = source[key];
  }

  while (true) {
    const result = schema.safeParse(candidate);
    if (result.success) {
      return {
        ...Object.fromEntries(Object.keys(source).map((key) => [key, undefined])),
        ...result.data,
      };
    }

    const fieldsToDrop = new Set(
      result.error.issues.flatMap((issue) => {
        const field = issue.path[0];
        return typeof field === 'string' && Object.prototype.hasOwnProperty.call(candidate, field)
          ? [field]
          : [];
      }),
    );
    if (fieldsToDrop.size === 0) {
      const defaults = schema.safeParse({});
      return defaults.success ? defaults.data : ({} as z.infer<Schema>);
    }
    for (const field of fieldsToDrop) delete candidate[field];
  }
}

/** Whether `value` is one the `key` field of `schema` accepts; an unknown key is not. The hosts' strict per-field checks (ADR-0071 decision 9) delegate here. */
export function isSearchFieldValueValid(
  schema: z.AnyZodObject,
  key: string,
  value: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(schema.shape, key)) return false;
  return schema.shape[key].safeParse(value).success;
}

/** Only bounded internal queue returns; never decode an opaque item identity. */
export function safeRecoveryReturnTo(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return undefined;
  try {
    const url = new URL(value, 'https://recovery.internal');
    if (
      url.origin !== 'https://recovery.internal' ||
      !['/home', '/integration', '/integration/coverage'].includes(url.pathname)
    )
      return undefined;
    if (/%(?:5c|2f)/i.test(url.pathname)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** `returnTo` search field of the recovery queues (`recoverySearchFields.returnTo`). */
export const returnToField = z
  .string()
  .refine((value) => safeRecoveryReturnTo(value) !== undefined)
  .optional();

export const recoverySearchFields = {
  category: recoveryCategorySchema.optional(),
  selected: z
    .string()
    .regex(/^r1_[A-Za-z0-9_-]{23}$/)
    .optional(),
  presentation: z
    .enum(['visible', 'hidden'])
    .transform((value) => (value === 'visible' ? undefined : value))
    .optional(),
  // TanStack decodes a hand-written ?history=true as the boolean true; a host's string 'true' means the same.
  history: z.preprocess(
    (value) => (value === 'true' ? true : value),
    z
      .boolean()
      .transform((value) => (value ? true : undefined))
      .optional(),
  ),
  returnTo: returnToField,
  cursor: z.string().min(1).max(4096).optional(),
};
export interface RecoverySearch {
  managedSystem?: string;
  category?: z.infer<typeof recoveryCategorySchema>;
  selected?: string;
  presentation?: 'hidden';
  history?: boolean;
  returnTo?: string;
  cursor?: string;
}
