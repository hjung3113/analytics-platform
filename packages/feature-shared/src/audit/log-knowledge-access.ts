// Log knowledge object-access audit detail schemas (#1504 S-a, ADR-0124). Ids and enum names only: the target kind and id, the
// grantee actor id, the rule id, the effect and the mode — never a name, a title or any text of the object. Registered into
// AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts. The subject types are not in the platform audit projection allow-list: a
// restricted object's id must not reach `console:access` Admins through it, so these events stay in `core.audit_log`.

import { z } from 'zod';

export const LOG_KNOWLEDGE_ACCESS_AUDIT_EVENT_TYPES = [
  'knowledge.access.mode_changed',
  'knowledge.access.rule_added',
  'knowledge.access.rule_revoked',
] as const;

/** Subject id: the target (model, SW version or Item) id for `mode_changed`, the rule id for the rule events. */
export const LOG_KNOWLEDGE_ACCESS_SUBJECT_TYPES = ['knowledge_access'] as const;

const TARGET_KIND = z.enum(['model', 'software', 'item']);
const MODE = z.enum(['internal', 'restricted']);
const EFFECT = z.enum(['allow', 'deny']);

export const knowledgeAccessModeChangedDetailSchema = z
  .object({ targetKind: TARGET_KIND, targetId: z.string().uuid(), from: MODE, to: MODE })
  .strict();

export const knowledgeAccessRuleAddedDetailSchema = z
  .object({
    ruleId: z.string().uuid(),
    targetKind: TARGET_KIND,
    targetId: z.string().uuid(),
    granteeId: z.string().uuid(),
    effect: EFFECT,
    expires: z.boolean(),
  })
  .strict();

export const knowledgeAccessRuleRevokedDetailSchema = z
  .object({
    ruleId: z.string().uuid(),
    targetKind: TARGET_KIND,
    targetId: z.string().uuid(),
    granteeId: z.string().uuid(),
    effect: EFFECT,
  })
  .strict();

export const LOG_KNOWLEDGE_ACCESS_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'knowledge.access.mode_changed': knowledgeAccessModeChangedDetailSchema,
  'knowledge.access.rule_added': knowledgeAccessRuleAddedDetailSchema,
  'knowledge.access.rule_revoked': knowledgeAccessRuleRevokedDetailSchema,
} as const;
