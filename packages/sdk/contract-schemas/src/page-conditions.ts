import { z } from 'zod/v4';

const nonblank = z.string().min(1).refine(value => {
  if (!value.trim()) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
}, 'Must be nonblank, well-formed text');
const text = z.object({ ko: nonblank, en: nonblank });
const option = z.object({ value: nonblank, label: text, disabledReason: text.optional() });
export const pageConditionOptionsResponseSchema = z.object({
  options: z.array(option),
  truncated: z.boolean().optional(),
}).superRefine((response, ctx) => {
  const seen = new Set<string>();
  response.options.forEach((item, index) => {
    if (seen.has(item.value)) ctx.addIssue({ code: 'custom', message: 'Option values must be unique across the category', path: ['options', index, 'value'] });
    seen.add(item.value);
  });
});
export const pageConditionGroupedOptionsResponseSchema = z.object({
  groups: z.array(z.object({ id: nonblank, label: text, lists: z.record(nonblank, z.array(option)) })),
}).superRefine((response, ctx) => {
  const seen = new Set<string>();
  const groups = new Set<string>();
  response.groups.forEach((group, groupIndex) => {
    if (groups.has(group.id)) ctx.addIssue({ code: 'custom', message: 'Group ids must be unique', path: ['groups', groupIndex, 'id'] });
    groups.add(group.id);
    for (const [listId, options] of Object.entries(group.lists)) options.forEach((item, index) => {
      if (seen.has(item.value)) ctx.addIssue({ code: 'custom', message: 'Option values must be unique across the category', path: ['groups', groupIndex, 'lists', listId, index, 'value'] });
      seen.add(item.value);
    });
  });
});
