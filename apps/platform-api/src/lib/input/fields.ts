// Zod building blocks for menu-action input fields, shared by the modules that own the value rules (#1411).
// The codes are the module API docs' (api/log-knowledge.md, api/improvement-items.md): a missing value AND a
// wrong type are `required`, `bounded` refuses a control character (`malformed`) or an overlong value
// (`too_long`), and a value that is a string but not a uuid is `malformed`. One copy of each so the parsers
// cannot drift the way the pre-kit copies did (improvement-items answered `malformed` for a wrong type where
// log-knowledge answered `required`).

import { z } from 'zod';

import { unsafeText } from '../text-safety.js';

/** The uuid spelling every input accepts; ids are stored in the DB's lower-case (the modules' `canonical`). */
export const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Wrong type = `required`, exactly like a missing value (the docs say "missing, wrong type or blank"). */
export const REQUIRED = { required_error: 'required', invalid_type_error: 'required' } as const;

/** A uuid string: absent or wrong type `required`, a string that is not a uuid `malformed`. */
export const uuid = z.string(REQUIRED).refine(isUuid, { message: 'malformed' });

/** A string within `max` code points with no control character; blank is allowed (callers add their own rule). */
export const bounded = (max: number) =>
  z.string(REQUIRED).superRefine((value, ctx) => {
    // Length counts code points, like the DB CHECKs (`[...value]` walks code points, not UTF-16 units).
    if (unsafeText(value)) ctx.addIssue({ code: 'custom', message: 'malformed' });
    else if ([...value].length > max) ctx.addIssue({ code: 'custom', message: 'too_long' });
  });

/** A required, non-blank text; the stored value is trimmed. */
export const requiredText = (max: number) =>
  bounded(max)
    .refine((v) => v.trim() !== '', { message: 'required' })
    .transform((v) => v.trim());

/** Optional text: absent → undefined (untouched); null or blank → null (cleared); otherwise trimmed. */
export const clearableText = (max: number) =>
  bounded(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim()));
