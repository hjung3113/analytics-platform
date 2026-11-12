import { z } from 'zod';

import { SQL_DIALECTS } from './sql-placeholders.js';

export const valueMapSchema = z.strictObject({
  site: z.record(z.string().min(1), z.string().min(1)).optional(),
  room: z.record(z.string().min(1), z.string().min(1)).optional(),
}).superRefine((map, ctx) => {
  for (const axis of ['site', 'room'] as const) {
    const values = Object.values(map[axis] ?? {});
    if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [axis], message: 'valueMap must be injective' });
  }
});
export type ValueMap = z.infer<typeof valueMapSchema>;

export const httpBaseUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && !/[\s?#]/.test(value);
  } catch { return false; }
}, 'baseUrl must be an absolute http(s) URL without credentials, query, fragment or whitespace');

export const targetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('http'), baseUrl: httpBaseUrlSchema,
    headers: z.record(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/), z.strictObject({ file: z.string().min(1) })).optional(),
    aud: z.string().min(1).optional(), valueMap: valueMapSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('sql'), dialect: z.enum(SQL_DIALECTS), connectionFile: z.string().min(1),
    pool: z.strictObject({ max: z.number().int().positive(), concurrency: z.number().int().positive() }).optional(),
    applicationName: z.string().min(1).optional(), valueMap: valueMapSchema.optional(),
  }),
]);
export type Target = z.infer<typeof targetSchema>;
export const targetsSchema = z.record(z.string().min(1), targetSchema);
