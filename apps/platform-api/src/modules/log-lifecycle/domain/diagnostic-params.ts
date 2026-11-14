import { z } from 'zod';
const uuid = z.string().uuid().transform((v) => v.toLowerCase());
const list = z.object({ attemptId: uuid, ruleResultId: uuid.optional(), page: z.number().int().min(0).max(1_000_000).default(0), pageSize: z.number().int().min(1).max(100).default(50) }).strict();
const item = z.object({ attemptId: uuid, producer: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/), itemKey: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/), tableKey: z.string().regex(/^[a-z0-9_]{1,32}$/).optional(), rowOffset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional() }).strict().refine((v) => v.rowOffset === undefined || v.tableKey !== undefined, 'rowOffset requires tableKey');
export const DIAGNOSTIC_LIST_KEYS = ['attemptId', 'ruleResultId', 'page', 'pageSize'] as const;
export const DIAGNOSTIC_ITEM_KEYS = ['attemptId', 'producer', 'itemKey', 'tableKey', 'rowOffset'] as const;
function judge<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, p: Record<string, unknown>): { ok: true; value: T } | { ok: false; message: string } {
  const result = schema.safeParse(p);
  return result.success ? { ok: true, value: result.data } : { ok: false, message: result.error.message };
}
export const parseDiagnosticListParams = (p: Record<string, unknown>) => judge(list, p);
export const parseDiagnosticItemParams = (p: Record<string, unknown>) => judge(item, p);
