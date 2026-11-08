// Capability vocabulary for the Permission module.
//
// Naming: `{module}.{action}` — keep names module-prefixed so the registry
// remains scannable and the permission UI can group by module.
//
// Sensitive marker: certain capabilities require a reason on request per
// docs/architecture/platform-api/05-permission-policy.md ## Sensitive Permissions.
// `workspace.admin` is the concrete Slice 1 implementation of the policy
// doc's "Admin permission" entry and is therefore Sensitive — a request for
// it must carry a non-empty reason and the audit detail must mark it
// `sensitive: true`. See F-014 in `.review/SLICE-1-REVIEW.md`.

export const CAPABILITIES = [
  'workspace.read',
  'workspace.admin',
  'voc.triage',
  'voc.read',
  'voc.read_public',
  'voc.create',
  'finding.read',
  'finding.manage',
  'task_request.self_approve',
  'survey.read',
  'survey.manage',
  'survey.read_personal_responses',
  'survey.export',
  'knowledge.catalog.manage',
  'knowledge.catalog.import',
  'knowledge.item.publish',
  'knowledge.spec.publish',
  'improvement.manage',
  'lifecycle.project.manage',
  'lifecycle.round.manage',
  'knowledge.draft.create',
  'explorer.source.read',
  'validation.catalog.report',
  'explorer.export',
  'explorer.investigate',
  'dataset.manage',
  'dataset.baseline.approve',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * How the workspace-admin role is satisfied *above* the generic
 * `roleSatisfies` layer in `modules/permissions/check-service.ts`.
 *
 * `roleSatisfies` only covers the Slice 1 role-derived set (`workspace.read`,
 * `workspace.admin`, `voc.triage`, `voc.read`). Several domain modules layer an
 * additional admin bypass on top of it, and those bypasses are part of the
 * access contract — not local shortcuts. This field is the single declaration
 * of that layering so the advisory `GET /me/permissions/check` decision cannot
 * drift from what the enforcing route will actually do (issue #372).
 *
 * - `none` — admin gets nothing beyond `roleSatisfies` for this capability.
 * - `unless_denied` — admin is allowed unless an explicit deny applies; the
 *   module runs the scoped check first and returns it when the reason is
 *   `explicit_deny`. See `modules/surveys/authorization.ts`.
 * - `always` — the module short-circuits on `role_level === 'admin'` before
 *   consulting Permission at all. See `modules/findings/authorization.ts` and
 *   `modules/task-requests/service.ts`.
 */
export type AdminModuleBypass = 'none' | 'unless_denied' | 'always';

export interface CapabilityMeta {
  /** When true, permission_requests must include a non-empty reason. */
  sensitive: boolean;
  /** Admin-role satisfaction layered above `roleSatisfies`. */
  adminModuleBypass: AdminModuleBypass;
  /**
   * ADR-0116 decision 4: high-risk capability that only a human login session may exercise. An API token is
   * refused (`permission.session_required`) even when the capability is in its scopes, and it cannot be
   * listed as a scope at issue. Single declaration; `check-service` and token issue both read it.
   */
  sessionOnly?: true;
  /**
   * #1491 (ADR-0122): the mirror of `sessionOnly`. Only an API token may exercise the capability; a human login
   * session is refused (`token_required`) even when its actor holds a grant. The effective right of a token call is
   * still the token owner's current grant ∩ the token's scopes (ADR-0116), so the capability stays an ordinary
   * grant on the system Actor (or issuer) and an ordinary scope on the token.
   */
  tokenOnly?: true;
}

/**
 * Authoritative per-capability metadata. The shape is intentionally an object
 * (not a Set/list of sensitive caps) so future entries can carry additional
 * fields — display labels, default expiry policy, audit hooks — without
 * another rename.
 */
export const CAPABILITY_META: Readonly<Record<Capability, CapabilityMeta>> = {
  // The four role-derived Slice 1 capabilities are satisfied by `roleSatisfies`
  // itself, so no module layers anything on top: `adminModuleBypass: 'none'`.
  'workspace.read': { sensitive: false, adminModuleBypass: 'none' },
  'workspace.admin': { sensitive: true, adminModuleBypass: 'none', sessionOnly: true },
  // voc.triage: NOT sensitive — Developers may request it for a specific MS.
  'voc.triage': { sensitive: false, adminModuleBypass: 'none' },
  // voc.read: NOT sensitive — Developers may request it for a specific MS to view VOCs.
  'voc.read': { sensitive: false, adminModuleBypass: 'none' },
  // voc.read_public (ADR-0110 decision 3): the public part of a VOC (`/vocs/public`). Requestable by every
  // role for one Managed System; it never widens voc.read, the operator surfaces or the ADR-0031 rule.
  'voc.read_public': { sensitive: false, adminModuleBypass: 'none' },
  // voc.create (#1358, ADR-0113): files a VOC in one Managed System whose `voc_create_mode` is `restricted`. Not sensitive.
  // `canCreateVoc` lets Admin through unless an explicit deny applies, so the advisory check mirrors `unless_denied`.
  'voc.create': { sensitive: false, adminModuleBypass: 'unless_denied' },
  // Finding point authorization short-circuits on the admin role before
  // consulting Permission (`modules/findings/authorization.ts`).
  'finding.read': { sensitive: false, adminModuleBypass: 'always' },
  'finding.manage': { sensitive: false, adminModuleBypass: 'always' },
  // Self-approval is sensitive because it bypasses normal reviewer separation.
  // `hasSelfApprovalCapability` still short-circuits on the admin role.
  'task_request.self_approve': { sensitive: true, adminModuleBypass: 'always', sessionOnly: true },
  // survey.read: NOT sensitive — Developers may request scoped read access for a Managed System.
  // ADR-0033 §C: Admin may bypass, but an explicit deny still wins.
  'survey.read': { sensitive: false, adminModuleBypass: 'unless_denied' },
  // Survey creation and management are sensitive actions for a Managed System.
  // ADR-0033 §C: same Admin bypass as survey.read, explicit deny dominant.
  'survey.manage': { sensitive: true, adminModuleBypass: 'unless_denied' },
  // Workspace Admin does not bypass this by role alone; explicit permission is required.
  // See docs/product/features/07-survey-system.md and ADR-0033 §C ("no role bypass, including Admin").
  'survey.read_personal_responses': { sensitive: true, adminModuleBypass: 'none' },
  // Workspace Admin does not bypass this by role alone; explicit permission is required.
  // See docs/product/features/07-survey-system.md and ADR-0033 §C ("no role bypass, including Admin").
  'survey.export': { sensitive: true, adminModuleBypass: 'none' },
  // Log knowledge catalog (ADR-0107 decision 3): workspace-scoped (no Managed System), not sensitive;
  // the Admin role always holds them.
  'knowledge.catalog.manage': { sensitive: false, adminModuleBypass: 'always' },
  'knowledge.catalog.import': { sensitive: false, adminModuleBypass: 'always' },
  // Log knowledge items (ADR-0109): same shape as the catalog rights; writes a published item.
  'knowledge.item.publish': { sensitive: false, adminModuleBypass: 'always', sessionOnly: true },
  // Log knowledge model specs (ADR-0111): same shape; seals (publishes) a model spec revision.
  'knowledge.spec.publish': { sensitive: false, adminModuleBypass: 'always', sessionOnly: true },
  // Improvement items (#1328 b): workspace-scoped, not sensitive; writes items. User role refused (supported-scope policy).
  'improvement.manage': { sensitive: false, adminModuleBypass: 'always' },
  // Log lifecycle (#1444 c): workspace-scoped, not sensitive; development projects and validation rounds. User role refused (supported-scope policy).
  'lifecycle.project.manage': { sensitive: false, adminModuleBypass: 'always' },
  'lifecycle.round.manage': { sensitive: false, adminModuleBypass: 'always' },
  // Log knowledge drafts (#1198 a): workspace-scoped, not sensitive; a human submits a draft of a new or revised item. Admin always; Developer and User by grant (owner answer #1198 Q2).
  'knowledge.draft.create': { sensitive: false, adminModuleBypass: 'always' },
  // Log explorer source read (#1469, design log-explorer §4): reads original log text through the Source adapter. Workspace-wide grant; the Source owner (`sourceOwner`) is judged per request on top (`SourceOwnerAccess`). No Admin role bypass: the text belongs to its Source owner. A token may carry it, with the daily body budget (#1472). Sensitive: a request states a reason, and the permission rows stay out of the platform audit projection allow-list (adding it there is a migration, not part of this node).
  'explorer.source.read': { sensitive: true, adminModuleBypass: 'none' },
  // Log explorer export (#1472, design log-explorer §4.1): hands original log text out of the platform as a CSV/JSONL download. Its own right, never implied by `explorer.source.read` (a read-only token cannot export). Same shape as the read: workspace-wide grant plus the Source owner rule, no Admin bypass, sensitive, may be a token scope.
  'explorer.export': { sensitive: true, adminModuleBypass: 'none' },
  // Log explorer investigation (#1472 registers the token scope; the investigation actions are node b): workspace-scoped, no Admin bypass. Sensitive for the same reason as the read: it is granted with a stated reason and stays out of the audit projection allow-list (no migration).
  'explorer.investigate': { sensitive: true, adminModuleBypass: 'none' },
  // Validation catalog report (#1491, ADR-0122): the Validator posts its rule catalog snapshot over a service token.
  // Token-only (never a human session) and no Admin bypass: the token owner needs the grant itself.
  'validation.catalog.report': { sensitive: false, adminModuleBypass: 'none', tokenOnly: true },
  // Log test datasets (#1477 D-a): workspace-scoped, not sensitive, session-only (design §9 defers token calls); datasets, their revisions and candidates. User role refused (supported-scope policy).
  'dataset.manage': { sensitive: false, adminModuleBypass: 'always', sessionOnly: true },
  // Log test dataset baseline approval (#1478 D-b, design log-test-datasets §5): workspace-scoped, sensitive (a stated reason; permission rows stay out of the audit projection allow-list), session-only. No Admin role bypass (the approval boundary is a grant, like the sensitive log explorer rights). Self-approval is allowed and recorded. User role refused (supported-scope policy).
  'dataset.baseline.approve': { sensitive: true, adminModuleBypass: 'none', sessionOnly: true },
};

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function isSensitiveCapability(cap: Capability): boolean {
  return CAPABILITY_META[cap].sensitive;
}

export function adminModuleBypassFor(cap: Capability): AdminModuleBypass {
  return CAPABILITY_META[cap].adminModuleBypass;
}

export function isSessionOnlyCapability(cap: Capability): boolean {
  return CAPABILITY_META[cap].sessionOnly === true;
}

export function isTokenOnlyCapability(cap: Capability): boolean {
  return CAPABILITY_META[cap].tokenOnly === true;
}

/** Capability names an API token may carry as scopes: every capability that is not session-only. */
export const TOKEN_SCOPE_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (cap) => !isSessionOnlyCapability(cap),
);

/**
 * Scopes an API token may carry that are NOT capabilities (ADR-0117 decision 9): they exist only on a token, are never
 * a grant, request or role right, and no human session holds them. `validation.worker` lets a token call the
 * validation queue's worker REST (claim, heartbeat, result, fail); only a service token may carry it.
 */
export const TOKEN_ONLY_SCOPES = ['validation.worker'] as const;
export type TokenOnlyScope = (typeof TOKEN_ONLY_SCOPES)[number];

export function isTokenOnlyScope(value: string): value is TokenOnlyScope {
  return (TOKEN_ONLY_SCOPES as readonly string[]).includes(value);
}
