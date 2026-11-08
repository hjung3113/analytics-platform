# Permission Policy

## Purpose

This file owns permission check order, audit event verbs, sensitive-capability rules, and permission-request decision mechanics.
What the default user can do, and the capability matrix, live in docs/product/features/09-permission-access.md. Do not copy that matrix here.

FO ADR-0066 (accepted 2026-10-13) adds revision, withdrawal/edit,
supported narrowing, selected risk detail, direct-grant and superseded-row behavior;
all are implemented. #1080/#1081 implement requester revisions and selected reads;
#1085 implements governed direct grants and superseded-row behavior.

## Role Level And Capability

Role Level controls authority; backend capability checks are authoritative.
Reporter is the Actor who submitted a specific VOC, not a separate role level.

Role meanings, the default-user boundary, and the capability matrix: docs/product/features/09-permission-access.md (AD Principle, Default User Can / Cannot, Capability Matrix). Adding a Role Level follows
`docs/adr/history/feedbackops/0048-role-level-extension.md`: the shared enum, the
`actors_role_level_check` constraint, `roleSatisfies`, and the domain gates
that compare `role_level` move together.

Capability vocabulary is module-prefixed (`{module}.{action}`,
`packages/feature-shared/src/enums/capabilities.ts`). Slice 5 (FO ADR-0024) adds
`finding.read` (read a Finding / its entity links) and `finding.manage`
(create/update a Finding). Both are Developer-requestable per Managed System and
are NOT sensitive. Reading or creating a Finding is Admin (workspace) or
Developer scoped to the Finding's `primary_managed_system_id`; User and Reporter
never read Findings directly. The #112/#124 Entity Links Finding endpoint and
command surfaces are the documented exception: a User/Reporter holding an
explicit `finding.read` or `finding.manage` grant retains that point capability
there, without an Admin-or-Developer role gate. Creating a Finding from a VOC additionally requires
`voc.read` on the source VOC's Managed System (no forging a Finding from an
unreadable VOC). Slice 6 issue #133 adds `task_request.self_approve` for
same-requester Task Request approval. It is Developer-requestable per Managed
System and sensitive. Slice 6 issue #134 introduces Task conversion and
Link Existing Task without a new capability; both reuse `finding.manage` on the
Task Request or Task Primary Managed System, with Admin bypass. Slice 6 issue
#135 keeps Task Detail reads and Finding Link Task on the same boundary:
Admin or Developer with `finding.manage` on the relevant Primary Managed
System; User is denied.
Slice 6 issue #136 extends Task Request creation to VOC and VOC Cluster sources
without adding a new capability. `POST /vocs/:id/request-task` mirrors
`POST /vocs/:id/create-finding`: source VOC read is permitted to its Reporter,
otherwise requires a deny-first `voc.read` check for every role including Admin,
plus the unchanged `finding.manage` gate on the source Primary Managed System. `POST
/voc-clusters/:id/request-task` mirrors cluster create-finding authority:
Admin or Developer with `finding.manage` on the cluster Primary Managed System.

The Findings module owns the canonical implementation of these predicates:
`checkFindingRead` resolves a point `finding.read` decision, preserving the
Permission Check Service clock and archived Managed System behavior;
`actorFindingReadScope` resolves `finding.read` list-filter scope; and
`checkFindingManage` resolves point `finding.manage` decisions. Entity Links,
VOC Clusters, Task Requests, and Tasks must consume the form matching their
original call-site semantics; they must not reconstruct Finding scope or
capability checks locally.

## Permission Check Order

```text
1. Validate workspace context.
2. Check explicit deny.
3. Check direct capability grant.
4. Check role-derived capability.
5. Check scoped Managed System permission.
6. If denied, determine whether request access is allowed.
```

Explicit Deny overrides general Allow.

Admin satisfaction has two layers. Do not conclude "Admin cannot X" from layer 1
alone.

```text
1. roleSatisfies (check-service.ts, step 4 above): Admin satisfies only workspace.read,
   workspace.admin, voc.triage, and voc.read. User satisfies only workspace.read.
   Developer satisfies none and needs Managed System grants.
2. Module bypass, declared per capability in CAPABILITY_META.adminModuleBypass
   (packages/feature-shared/src/enums/capabilities.ts):
   - always: finding.read, finding.manage, task_request.self_approve, knowledge.catalog.manage, knowledge.catalog.import, knowledge.item.publish, knowledge.spec.publish, improvement.manage, lifecycle.project.manage, lifecycle.round.manage, lifecycle.gate.decide, knowledge.draft.create, dataset.manage, dataset.suite.run, knowledge.access.manage
   - unless_denied: survey.read, survey.manage, voc.create (an explicit deny still wins, FO ADR-0033 section C; ADR-0113 for voc.create)
   - none: every other capability, including survey.read_personal_responses, survey.export, explorer.source.read (no Admin bypass), dataset.baseline.approve and validation.catalog.report
```

Layer 2 is enforced by `findings/authorization.ts`, `surveys/authorization.ts`,
and `task-requests/service.ts`, and applied to scope resolution in
`capabilityScope`. `applyAdminModuleBypass` (`check-service.ts`) mirrors it onto
the advisory `GET /me/permissions/check` decision so the frontend display hint
matches the enforcing route.

`GET /me/permissions/scope` resolves a capability over every Managed System
using the same order as a point check: workspace mismatch denies; active
workspace-wide or matching Managed-System denies deny before grants; active
workspace-wide grants allow; role-derived capability allows; then active
matching Managed-System grants allow. A workspace-wide grant or role match
returns `kind: all` only when there are no active Managed-System-scoped denies.
When such denies exist, the scope is the workspace Managed System list minus
the denied ids so its membership remains identical to point checks.

VOC list/count/detail/conversation scope resolution uses the same capability rule
as `GET /me/permissions/scope` and point checks, including explicit denies for
Admin. `voc.read` and `voc.triage` are independent: Triage lists/counts use their
intersection; effective summary visibility uses their union. A `voc.read` deny
can leave summary visibility through `voc.triage`, but grants no conversation
read. A `voc.triage` deny removes Internal Comments from both inline detail and
conversation pages. Denying both scopes hides non-own detail/conversation with
404; reporter-own read arms remain unchanged. Survey read scope honours denies
(`unless_denied`); Finding read/manage keeps its intentional `always` bypass.

At All Systems (전체 Managed System), Triage eligibility may come from a non-empty
`voc.triage` capability scope when the workspace point check is not approved.
The queue remains authoritative for `voc.read` ∩ `voc.triage`; an authorization
failure replaces even cached rows/detail with the request-access blocked panel.
Selecting a Managed System keeps the point-check gate; navigation counts follow
the same eligibility gate. The frontend does not compute the intersection. When
that intersection is empty, or a selected System is inside triage but outside
read, the queue's requestable permission is `voc.read` (that System, or null
with no selection) rather than another `voc.triage` grant. A selection that
lacks triage still requests `voc.triage`.

Managed System is the MVP authorization boundary below workspace Admin. Sibling
Managed Systems and Analytics Area are not grant sources. See the 09 Capability
Matrix notes.

Permission scope shape:

```text
workspace_id required
managed_system_id optional for Admin, required for Developer-scoped grants
object_type/object_id are historical storage fields; single-object authorization is post-MVP (FO ADR-0066)
```

Admin grants may omit managed_system_id when the capability is workspace-level.
Developer grants must include managed_system_id for scoped VOC triage,
Findings, Task Requests, Tasks, Surveys, Dashboard queues, Public Updates, and
Internal Comments. Analytics Area filters may narrow a list query but must not be
used as the source of authorization.
FO ADR-0067 supersedes the earlier unconditional assignment-failure rule. An invalid
explicit responsibility target returns `validation.failed`; an absent/invalid automatic
candidate falls through to the next rule and ultimately the existing scoped queue with
null fields and an Admin warning. Concrete Actors must pass the destination gate with
its current Admin-bypass/explicit-deny semantics inside the transaction. Active same-workspace
team responsibility grants no permission or self-approval and chooses no member.
Resolution order: docs/product/features/09-permission-access.md, Default Owner / Reviewer Resolution.
Survey operator validation remains separate and unchanged.

For list filters, managed_system_id=all means the actor's effective Managed
System scope union. Workspace Admin can receive true workspace-wide results.
Developers receive only records in their granted Managed System scopes, even
when the frontend URL says all. A Developer with one scope receives the same
result as that single scope. User-facing views should not expose all as a
workspace-wide bypass.

## Sensitive Permissions

Sensitive permission requests require a reason (`validation.sensitive_reason_required`).
Sensitivity is per capability, `CAPABILITY_META.sensitive` in
`packages/feature-shared/src/enums/capabilities.ts`:

```text
workspace.admin
task_request.self_approve
survey.manage
survey.read_personal_responses
survey.export
explorer.source.read
explorer.export
explorer.investigate
explorer.handoff
dataset.baseline.approve
lifecycle.gate.decide
```

Every other capability is non-sensitive and needs no reason beyond the route's `min(1)`.

`knowledge.catalog.manage` and `knowledge.catalog.import` (log knowledge hub, ADR-0107 decision 3) are workspace-scoped: a grant carries `managed_system_id` null because the catalog is workspace-wide and `log-dev` is not a Managed System. Both are non-sensitive with `adminModuleBypass: 'always'`; they are requestable through the ordinary permission request with no Managed System. Catalog reads need no capability: every active workspace session holds `platform:view`. `knowledge.catalog.manage` is enforced by the `logKnowledge.*` write actions (`modules/log-knowledge/catalog-actions.ts`, capability check plus `applyAdminModuleBypass`; api/log-knowledge.md §Write actions); `.import` is enforced by #1195. Who holds them by role is owned by `docs/product/features/09-permission-access.md`.

`voc.read_public` (ADR-0110 decision 3, #1288 g) lets a holder read the public part of VOCs in one Managed System. It is non-sensitive, `adminModuleBypass: 'none'`, Managed System scoped (ordinary policy branch: one candidate per live Managed System, no workspace-wide candidate) and requestable by every role including User. It is a separate read rule, **not** part of ADR-0031: `voc.read_public` is not in `actorEffectiveScope`, `similarVocVisibilityPredicate`, `isVocVisibleToActor` or `canReadVocAsSource`, so no operator, peer, recommendation, cluster, dashboard, nav-count or notification path changes. The public arm lives in `modules/voc/public-read/rule.ts` and admits a VOC when the actor reported it, or its Managed System is in `voc.read_public ∪ voc.read ∪ voc.triage` scope, or it is the 「플랫폼」 system (`platformManagedSystemId`: the one live Managed System with `external_key = 'platform'`; none or several → no platform arm). The attachment download gains one arm for body and `public_update` attachments of such VOCs (api/voc.md §VOC public read). The capability is in the platform audit projection list (migration 0085).

`voc.create` (ADR-0113, #1358) decides who may file a VOC in one Managed System whose `core.managed_systems.voc_create_mode` is `restricted`. It is non-sensitive, Managed System scoped (ordinary policy branch, requestable and directly grantable to every role including User) and `adminModuleBypass: 'unless_denied'`. `canCreateVoc` (`modules/permissions/voc-create-policy.ts`) is the only decision point: an explicit `voc.create` deny (workspace-wide or that system) refuses everyone, Admin included; otherwise an `open` system and the 「플랫폼」 system (`external_key='platform'`, whatever its stored mode) admit everyone, and a `restricted` system admits Admin or an active `voc.create` grant that is workspace-wide or scoped to that system. The business-system link (`space:<id>`) grants nothing: linked systems start `open` and an admin narrows them. `GET /me/permissions/check?capability=voc.create` answers only the grant question and does not know the mode; screens use `GET /vocs/create-targets`. The capability is in the platform audit projection list (the migration that adds `voc.create`).

**User-excluded capabilities after a demotion (#1531).** The set refused for a User recipient (`NOT_FOR_USER_ROLE` in `supported-scope-policy.ts`) is also enforced at decision time: `loadDenyAndGrantRows`, the one loader behind `checkCapability` and `resolveCapabilityScope`, ignores grant rows (workspace and Managed System scoped) while the actor's CURRENT role is User. Grant rows are not changed or revoked by a demotion, so a promotion back restores them; explicit denies still apply.

`knowledge.item.publish` (ADR-0109 decision 7, #1197 w) follows the same pattern: workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, requestable with no Managed System, refused for a User recipient at request, approval and direct grant (`NOT_FOR_USER_ROLE`). It is enforced by the five `logKnowledge.item*` write actions (`modules/log-knowledge/item-actions.ts`, capability check plus `applyAdminModuleBypass`), whose menu permission `knowledge:item-publish` maps to it in `PLATFORM_PERMISSION_TABLE` (rule `item-publish`).

`knowledge.spec.publish` (ADR-0111, #1196 b1) has the same shape for the model spec writes (menu permission `knowledge:spec-publish`, rule `spec-publish`); the three SW change writes `specChangeAdd|Retire|Confirm` (#1196 c) use the same capability and menu permission, no new one. `improvement.manage` (#1328 b, [api/improvement-items.md](api/improvement-items.md) §Write actions) too: workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, requestable with no Managed System, refused for a User recipient (`NOT_FOR_USER_ROLE`); enforced by the six `improvement.item*` write actions (capability check plus `applyAdminModuleBypass`), whose menu permission `improvement:manage` maps to it in `PLATFORM_PERMISSION_TABLE` (rule `improvement-manage`). Both are in the platform audit projection list (0092, 0094).

`lifecycle.project.manage` and `lifecycle.round.manage` (#1444 c, [api/log-lifecycle.md](api/log-lifecycle.md)) have the same shape for the log lifecycle writes: workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, requestable with no Managed System, refused for a User recipient. Menu permissions `lifecycle:project-manage` (rule `lifecycle-project-manage`; the four project actions) and `lifecycle:round-manage` (rule `lifecycle-round-manage`; `roundOpen`, `roundClose`). Reads need only `platform:view`. Node d (#1445) adds no capability: `requestCreate`/`requestCancel` use `lifecycle:round-manage`; `queueSettingsUpdate`/`excerptAccessSet`/`excerptDelete` use `console:access` (admin); the worker REST needs the **token-only scope** `validation.worker` (not a capability, service tokens only, never held by a human session); the excerpt body needs the per-source-owner right `lifecycle.excerpt.read`, kept in `log_lifecycle.excerpt_reader` because the permission module has no per-source scope (the admin role does not bypass it, tokens cannot read) — see [api/log-lifecycle.md](api/log-lifecycle.md) §Validation request queue.
`explorer.investigate` (#1468 b, [api/log-explorer.md](api/log-explorer.md)) is workspace-scoped, **sensitive** and `adminModuleBypass: 'none'` (registered by #1472, see the paragraph below), requestable with no Managed System and additionally refused for a User recipient (ADR-0107 decision 3 pattern); menu permission `explorer:investigate` (rule `explorer-investigate`) is declared by the five investigation writes. The reads need only `platform:view` and are owner-scoped. It covers creating and editing an investigation and its evidence locations only; reading Source records (`explorer.source.read`) is a separate capability of a later node.

`explorer.handoff` (#1474 X-h, [api/log-explorer.md](api/log-explorer.md) «Evidence handoff») is the right to hand evidence locations of one's own investigation to a validation Round or a knowledge draft: workspace-scoped, **sensitive**, `adminModuleBypass: 'none'`, requestable with no Managed System, refused for a User recipient, a token scope (not session-only). Menu permission `explorer:handoff` (rule `explorer-handoff`) is declared by `logExplorer.evidenceHandoff`. It grants no data by itself: the receiver re-judges its own capability (`lifecycle.round.manage`, `knowledge.draft.create`) and the Source-owner rule (`SourceOwnerAccess`) is checked for the investigation's Source owner. A token needs the receiver's capability as a scope too.

`lifecycle.project.manage` and `lifecycle.round.manage` (#1444 c, [api/log-lifecycle.md](api/log-lifecycle.md)) have the same shape for the log lifecycle writes: workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, requestable with no Managed System, refused for a User recipient. Menu permissions `lifecycle:project-manage` (rule `lifecycle-project-manage`; the four project actions) and `lifecycle:round-manage` (rule `lifecycle-round-manage`; `roundOpen`, `roundClose`). Reads need only `platform:view`.

`dataset.manage` (#1477 D-a, [api/log-datasets.md](api/log-datasets.md)) has the same shape for the log test dataset writes: workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, requestable with no Managed System, refused for a User recipient like `lifecycle.*`. Menu permission `dataset:manage` (rule `dataset-manage`; the six dataset, revision and candidate actions). Reads need only `platform:view`; a `private` dataset is further limited to its owner by the read itself. `dataset.suite.run` of the design comes with its node, not now. It is in the platform audit projection list.

`dataset.baseline.approve` (#1478 D-b, [api/log-datasets.md](api/log-datasets.md)) approves and thereby supersedes a log test dataset baseline: workspace-scoped, **sensitive** (a request states a reason; its permission rows stay out of the audit projection allow-list, so migration 0112 does not touch the projection), **session-only** (a token is refused and cannot carry it as a scope), `adminModuleBypass: 'none'` (the approval boundary is a grant; precedent: the sensitive log explorer rights), requestable with no Managed System, refused for a User recipient like `dataset.manage`. Menu permission `dataset:baseline-approve` (rule `dataset-baseline-approve`; the `baselineApprove` action), so bootstrap lists it for a grantee only, not for an Admin. Self-approval is not blocked: the author may approve their own draft and the event and audit row say `selfApproved: true` (log-lifecycle D3).

`lifecycle.gate.decide` (#1446 e, [api/log-lifecycle.md §Gate decision](api/log-lifecycle.md#gate-decision-node-e-1446), ADR-0116 decision 4) is the business approval of a 개발 건 stage: workspace-scoped (no Managed System), **sensitive** (a request states a reason; its permission rows stay out of the platform audit allow-list, so no migration), **session-only** (`CAPABILITY_META.sessionOnly`: a token is refused by `checkCapability` with `session_required` before any statement, and the capability cannot be a token scope), `adminModuleBypass: 'always'`, requestable with no Managed System, refused for a User recipient. Holders: the Admin role and explicit grants (a Developer receives it by request; nobody holds it by default). Menu permission `lifecycle:gate-decide` (rule `lifecycle-gate-decide`; `gateDecide`). The action additionally refuses any actor that is not an `internal_member`, so a service (`system`) identity never decides. Self approval is allowed and recorded (`self_approved`).
`dataset.suite.run` (#1479 D-c, [api/log-datasets.md](api/log-datasets.md)) requests a regression suite run: workspace-scoped, **not sensitive** (a run spends worker capacity, exposes no data the actor could not read; same shape as `lifecycle.round.manage`; a per-user cap of 3 concurrent runs bounds it), **session-only**, `adminModuleBypass: 'always'`, requestable with no Managed System, refused for a User recipient and — like `dataset.baseline.approve` — re-judged against the CURRENT role on every run. Menu permission `dataset:suite-run` (rule `dataset-suite-run`; the `suiteRun` action). Its permission rows are in the audit projection allow-list (migration 0114).

`knowledge.access.manage` (#1504 S-a, [api/log-knowledge.md](api/log-knowledge.md#object-access-1504-s-a-migration-0112)) sets the access mode and the allow / deny rules of a model, SW version or Item: workspace-scoped, **sensitive**, `adminModuleBypass: 'always'`, **session-only** (ADR-0116 decision 4), requestable with no Managed System, **Admin-only recipient** (Developer and User recipients refused on request, approval and direct grant). Menu permission `knowledge:access-manage` (rule `knowledge-access-manage`). It governs managing only: reads of knowledge objects have no Admin bypass and judge the rules like anyone's; a holder may grant themselves access (audited).

`knowledge.draft.create` (#1198 a, [api/log-knowledge.md](api/log-knowledge.md#knowledge-drafts-1198-a-migration-0101)) is workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, requestable with no Managed System, and — unlike the log knowledge capabilities above — **not refused for a User recipient** (owner answer on #1198: Contributors include field users). It lets a human author, update, submit and withdraw their own draft; it never publishes. Menu permission `knowledge:draft-create` (rule `draft-create`; the four draft actions). Reviewing (approve / reject / request changes) and publishing stay on `knowledge.item.publish` (#1198 b, [api/log-knowledge.md](api/log-knowledge.md#review-decisions-1198-b)); the token core marks that capability session-only, so no token or service actor can decide (token subjects cannot review or publish; AI and Validator drafts arrive through `knowledge.draft.create` tokens only, [api/log-knowledge.md](api/log-knowledge.md#agent-and-validator-submission-over-api-tokens-1198-c)). Self-approval: a human may approve a draft they authored through their session (the review row and audit mark `selfApproval`); a reviewer who wrote a revision through a token may not (`self_approval_via_token`).

`explorer.source.read` (#1469, [api/log-explorer.md](api/log-explorer.md)) lets a holder read original log text through the Source adapter. It is workspace-scoped (no Managed System), **sensitive** (a request states a reason; its permission rows are therefore not in the platform audit projection allow-list, which would need a migration), `adminModuleBypass: 'none'` (an Admin needs a grant like anyone else) and may be a token scope (not session-only). It is judged on every read, never cached across requests, and once more before the text leaves. The design scopes it to a `sourceOwner` (design log-explorer §4), but no permission table carries a Source owner yet: the owner half is the injected `SourceOwnerAccess` rule (`denyAllSourceOwners` in production, so nothing is readable until the owner-scoped grant model is decided). The platform entry right stays `platform:view`. `explorer.export` and `explorer.investigate` (#1472, [api/log-explorer.md](api/log-explorer.md)) are registered with the same shape — workspace-scoped, **sensitive** (so still no audit-projection allow-list migration), `adminModuleBypass: 'none'`, requestable with no Managed System, may be token scopes. `explorer.export` hands original text out of the platform as a download and is **its own right**: `explorer.source.read` never implies it, and a read-only token cannot export. It is also Source-owner scoped (`SourceOwnerAccess`, the same seam as the read). `explorer.investigate` gates the investigation actions of node b (#1468, migration 0109). `explorer.handoff` is a later node and is not registered.
`validation.catalog.report` (#1491, [api/log-rules.md](api/log-rules.md), ADR-0122) is the mirror of a session-only capability: **token-scope-only** (`CAPABILITY_META.tokenOnly`). Workspace-scoped, non-sensitive, `adminModuleBypass: 'none'` (the Admin role does not carry it), requestable with no Managed System like the other workspace capabilities, but a **human login session never exercises it**: `checkCapability` denies a session (and non-request code) with `token_required` before any grant is read, so a cookie call to `POST /api/v1/validation-catalog/report` is `403 permission.denied`. A token passes only with the scope in its `scopes` **and** a current workspace-wide grant held by its owning Actor (service token: the system Actor; personal token: its issuer), which is the ordinary scope ∩ permission rule below. Service tokens are issued by an Admin only. Because no session can use it, it is not offered in the permission request form.

Requester expiration is optional, with no automatic default (FO ADR-0044, confirmed
by FO ADR-0066). Any supplied/resolved non-null expiry must be future in create,
edit, supplement, approve, and direct grant. Admins may override grant expiration
without overwriting requested expiration. Workspace
Admin-level grants should not be offered through ordinary blocked-action request
flows in MVP; they require an explicit Admin governance path.

When a permission grant expires, previously opened objects or actions that
depended on that grant must stop executing privileged actions. Open panels should
move to a permission-lost or stale state and offer request-access when policy
allows.

Task Request self-approval is not included in the default Developer scoped
review permission. A Developer may approve their own Task Request only when a
grant includes `task_request.self_approve` for the same managed_system_id. The
review request must include a reason and the approval audit event records
`self_approval: true`, `sensitive: true`, and the reason.

## Permission Request Lifecycle

```text
pending
-> needs_more_info -> pending
-> approved | rejected | expired | revoked | cancelled
```

`needs_more_info` keeps the same Permission Request identity. Requester
supplementation moves the same request back to `pending`; it must not create a
new request for the same source object, source action, and requested scope.
FO ADR-0066 adds requester-only same-ID pending edit and withdrawal from either open
status to cancelled. Each successful mutation advances proposed revision/updated_at;
wrong status or revision returns conflict.stale_write after authorization. Withdrawal
retains history, frees open uniqueness, and writes no grant/deny/domain action.

Permission requests may originate from blocked linked objects, blocked
`next_actions`, or explicit Admin request flows. Requests created from blocked
UI must persist source context when available:

```text
source_object_type optional
source_object_id optional
source_action_id optional
requested_scope
reason
requested_expiration optional
more_info_request optional
return_route_intent optional
```

For `blocked_requestable` actions, the backend must provide the minimum
requestable scope candidates. Frontend clients may render and submit only those
API-provided candidates; they must not invent broader workspace, all-managed-
system, or Admin scopes from local status, role, or route context.

Admin review responses must include requester identity, current role/scope,
requested capability, requested scope, safe source summary when available,
reason, risk indicators, requested expiration, explicit deny state, and allowed
decision actions.

The admin review queue is read via `GET /permissions/requests` (the legacy
`GET /permission-requests` remains compatible), which returns the workspace's
open (`pending` | `needs_more_info`) requests and a `count` by default. Admins
may request `?status=pending|needs_more_info|approved|rejected|cancelled|all` to review
decided rows. The endpoint is gated by `workspace.admin`; a non-admin caller
receives `permission.denied` (`403`). The caller-scoped variant
`GET /permission-requests/mine` requires only a session (an Actor may always
read their own open requests; `?status=all` adds the caller's own decided requests, owner-only, newest 50).

Rejected Permission Requests must not be immediately resubmitted for the same
source object, source action, and requested scope unless the rejection response
allows appeal, requests more information, or provides `retry_after`. This keeps
Admin review queues from becoming repeated-denial loops while still allowing
corrected or supplemented requests.

After approval, the API response should provide enough route intent for the
frontend to return the requester to the originally blocked object or action
when possible.

Approval must not automatically execute the originally blocked domain action.
Permission approval and domain mutation are separate audited actions; after
approval, the requester returns to the original object or action and explicitly
runs it again.

### Admin decision lifecycle

Only a request in `pending` or `needs_more_info` is decidable. The four
administrator endpoints all require `workspace.admin`, lock the request row,
and write the request change plus its audit row in one transaction:

```text
POST /permissions/requests/:id/approve         { expected_revision, reason?, expiration?, granted_managed_system_id?, self_approval? }
POST /permissions/requests/:id/reject          { expected_revision, reason: string }
POST /permissions/requests/:id/need-more-info  { expected_revision, note: string }
POST /permissions/requests/:id/deny            { expected_revision, reason: string }
```

- Approve grants the requested capability with the same or a supported narrower
  scope through the shared Permission grant command, then sets the request to
  `approved`. FO ADR-0066 reopens and supersedes the earlier copy-scope-only rule:
  workspace may narrow to one server-valid Managed System; system cannot widen
  or move to a sibling, and workspace-only authority cannot become system scope.
  The response/audit distinguish requested and granted scope/expiry without
  overwriting requested fields. Unsupported legacy object approval is 422. It never
  auto-runs the blocked action. The grant's expiration is the requested
  expiration unless the approver changes it (`expiration`: a future datetime
  overrides it, `null` clears it, omitted keeps it; a past datetime is
  `validation.failed`). The `permission_approved` audit detail records both the
  requested and the granted expiration (#590, per `docs/product/features/09-permission-access.md`).
- Reject sets the request to `rejected`; it does not mint a grant.
- Need-more-info sets it to `needs_more_info`; the note is kept in audit detail.
- Explicit deny copies the requested capability and Managed System scope into a
  real `permission_denies` row and sets the request to `rejected`. A
  workspace-wide deny takes precedence over every grant; a Managed-System-scoped
  deny takes precedence only for checks in that same Managed System.
- Reject, deny, and need-more-info require a non-empty trimmed reason/note.
  Approve requires one only for `isSensitiveCapability`; it is optional for a
  non-sensitive capability. Missing decision reason/note is a `validation.*`
  response (`422`), including `validation.sensitive_reason_required` for a
  sensitive approval. Reviewers may alter granted scope/expiry within FO ADR-0066,
  but never overwrite the requested values. All resolved non-null expirations
  must be future, including an unchanged requested expiry.
- Unknown request IDs are `not_found.record` (`404`); non-decidable requests
  are `conflict.stale_write` (`409`). Duplicate active grants/denies are
  `conflict.capability_already_granted` / `conflict.capability_already_denied`.
  `Idempotency-Key` replays the stored decision response without a second write.
  All decisions require proposed expected_revision and advance revision. Compare
  inside the idempotent run after row lock; authorization precedes replay, and
  replay precedes revision/status checks. Return current_revision only after
  authorization; no request data on owner/workspace lookup failure.

### Self-approval policy (Permission Requests, self deny lifts, and direct self grants)

An Admin deciding their own Permission Request is a self-approval. The resolved
workspace `permission_self_approval` setting defaults to `allowed`; in that
mode the approve body must include strict
`self_approval: { policy_citation: string, peer_reviewer_absence: string }`.
The approve body schema lives in `packages/feature-shared/src/permissions/decisions.ts`, and the backend route imports it rather than declaring its own.
The recorded `permission_approved` audit detail carries this envelope only for
self-approval. The envelope is rejected for an approval decided by another
Admin. If the workspace setting is `forbidden`, self-approval returns
`permission.denied` without changing the pending request; another Admin may
approve the same request normally.

An Admin lifting an active deny on themself follows the same setting:
`forbidden` returns `permission.denied` without changing the deny or writing an
audit row, while `allowed` permits the lift and records `self_lift: true` in the
audit detail. An Admin may revoke their own grant because that action only
lowers privilege. FO ADR-0066 extends the setting to direct self grants: forbidden
returns permission.denied; allowed requires the same strict self_approval envelope
and records self_grant: true plus the envelope. Another-Actor grant rejects that
envelope. This is capability authority, not a Role Level promotion.

The canonical event values (`AUDIT_EVENT_TYPES`), Zod enum (`auditEventTypeSchema`), and per-event detail schemas (`AUDIT_EVENT_DETAIL_SCHEMAS`) are aggregated in `packages/feature-shared/src/enums/audit-events.ts`. The event literals and detail schemas are owned per domain in `packages/feature-shared/src/audit/*.ts`.

Audit events (the permission and task-request subset; the full vocabulary is in code):

```text
permission_requested
permission_approved
permission_rejected
permission_needs_more_info
permission_denied
permission_more_info_submitted
permission_revoked
permission_deny_revoked
task_request_approved
task_request_rejected
task_request_needs_more_evidence
task_request_self_approval_denied
task_request_created_from_finding
task_request_created_from_voc
task_request_created_from_voc_cluster
task_created_from_request
task_linked_to_request
```

Read-time expiry is enforced at check time (`grant_expired`); the `permission_expired`
event is not emitted:

```text
permission_expired
```

### Grant revoke and deny lift (FO ADR-0061)

`POST /permissions/grants/:id/revoke` and `POST /permissions/denies/:id/revoke`
are workspace-admin commands. They lock and update only active rows, require
a trimmed reason, and append one strict audit event in the same transaction.
An expired grant is not active and returns `conflict.permission_not_active`;
an active deny is lifted by setting its revoke metadata. Permission Request
status does not change. Revoke does not terminate sessions or change
role-derived capabilities.

The permission check treats a revoked grant or an expired grant as requestable
using the same workspace scope as `no_grant`. The state mapper returns
`pending_request` when the Actor has an open request for that capability and
otherwise returns `revoked` or `expired`, respectively. `workspace.admin` is
not ordinarily requestable (`isOrdinarilyRequestable`, the rule
`validateSupportedScope` enforces), so its `no_grant`, `grant_expired` and
`grant_revoked` denies carry `requestable: null` and, with no open request, the
state is `blocked_non_requestable` instead of `request_access` / `expired` /
`revoked`. A revoke notification
goes to the grant's Actor; deny lift sends no notification. There is no migration
or grant change for these commands.
Domain responses treat `grant_revoked` and `grant_expired` like `no_grant`
(`isRequestableDenial`, #775); paths keyed on `requestable !== null` (Survey
results and follow-up) include `requestable_permission` for them.

## Summary-Visible Contract

When entity link visibility is `summary_visible`, the target module returns a safe summary.

FO ADR-0023 is the authoritative summary contract (Slice 4.4 #115): canonical Task
field list, forbidden-field list, and the decision table. The fields below are
the canonical list FO ADR-0023 reconciles to. No `voc` summary exists; `summary_visible`
is not emitted for a `voc` target. Task is the only provider with a reporter
summary (`tasks/entity-link-provider.ts`, FO ADR-0032); every other provider
returns `{ available: false }`.

Dashboard recovery visibility may be summary-safe even when the underlying
source object is not fully visible. Gap visibility, source-object visibility,
source jump visibility, and action visibility are separate backend decisions.
If the source object is hidden, the response may expose only a safe recovery
category and domain-safe summary fields; it must not expose raw titles,
descriptions, reporter identity, personal Survey response detail, or private
linked-object content.

Task summary visible to Reporter:

```text
public_title
reporter_facing_status
owning_team_public_name
expected_resolution_date optional
last_public_update_at
public_update_excerpt
```

Forbidden in reporter summary:

```text
- internal comments
- internal assignee notes
- raw task status
- backlog priority
- individual Developer names
- internal due dates
- root-cause detail
- severity
- confidence
- private customer or survey response details
- permission decision internals
```

Public Update may be written only by workspace Admin or Developer in the same
Managed System Permission Scope. Reporter Reply may be written only by the
Reporter on their own VOC. Internal Comment remains private to authorized
Admins and same-scope Developers.

## Frontend Permission States

```text
hidden_existence
summary_visible
request_access
blocked_non_requestable
pending_request
approved
rejected
expired
revoked
```

The backend decides which state applies.

## Accepted close-out extensions (FO ADR-0066; implemented)

The rules above incorporating revision, withdrawal and narrowing replace older
scope-copy/default-expiration text. #1080 implements versioned requester
mutations, supported-scope validation and narrowed Admin decisions; #1081 adds
selected owner/Admin reads and explained risk; #1085 adds the governed direct
grant and audited expired reissue; #1086 adds the direct-grant UI. The complete
close-out implementation shipped in #1080–#1086.
`api/permissions.md` owns exact bodies, reads, responses and errors.

One Permission capability/scope policy supplies server candidates and validates
create/edit/supplement/approval/direct grants inside transactions. Developer-scoped
capabilities require an active Managed System; honor workspace Survey export per
FO ADR-0033. No ordinary workspace.admin request; use explicit direct-grant governance.
Reject non-null requested object scopes, preserve historical rows/source provenance,
and inventory legacy object grants before release (FO ADR-0066 / post-MVP backlog).

Recipient serialization uses an Auth-owned lock extension. Shared grant writer lock
order is recipient Actor, request if relevant, workspace policy row, grant row.
Request creation and scope-changing requester commands participate; the policy row
is obtained through Workspace Settings' approved seam. Admin capability is checked
before replay; a changed body under the same key conflicts. Audits and idempotency
rows share the mutation transaction.

Direct grant requires a reason for all capabilities and explicit workspace.admin
form governance. Match open asks by recipient/capability/supported scope regardless
of source, and refuse with a safe review destination; overlapping active denies
require explicit lift, never silent removal. Workspace grants overlap any deny for
that capability; system grants overlap workspace/same-system denies, not siblings.
Preflight is advisory and all checks run again transactionally on submission.
No Role Level change, automatic action, entity link, fake ask or decided notification.

New expired reissue sets superseded_at on an expired exact-tuple predecessor and
inserts a fresh ID. Preserve expiry/grantor/time/revoke fields. Keep the full COALESCE
unique scope tuple and change only the predicate to revoked_at IS NULL AND
superseded_at IS NULL; never now(). Checks, scope reads, active lists, revoke and
seed existence checks exclude superseded grants. Audit failure restores both rows;
expired/old-ID revoke stays conflict.permission_not_active.

Permission computes four explained codes only for selected Admin detail:
sensitive_capability, workspace_scope, no_expiration, active_deny (#1081).
Effective access and Role Level are facts, not a role-jump score. Unknown/failure
is retryable, not zero risk. Owner detail/mine omit risk and deny internals. Core
owns the latest-question audit projection; source-owner gates/allowlists control
safe summaries, including personal Survey data without an Admin bypass.

Proposed strict audits (register in shared permission audit schemas and aggregator):
- permission_request_cancelled: request subject; previous status, requester,
  capability/scope, optional trimmed reason, previous/resulting revisions.
- permission_request_updated: request subject; complete previous/resulting editable
  reason/scope/expiry and revisions, capability/requester identity.
- permission_granted: grant subject; actual recipient/capability/scope/reason/expiry,
  grant ID, create/reissue mode, predecessor ID on reissue, self_grant/envelope when self.
- Existing request mutation audits gain revisions; supplementation keeps pre/post
  values. permission_approved keeps the request subject and gains requested/granted
  scope, revisions, and predecessor ID when reissuing. Requestless grants do not
  reuse request-decided notifications. Withdrawal emits no decided notification.

## Safe Survey evidence reuse (FO ADR-0064; implemented #816)

A Survey result reader may browse approved safe excerpt candidates with
`survey.read` and attach with `finding.manage` on the target Finding, without
`survey.read_personal_responses`. Non-holders obey existing response cohort,
per-question answer and low-bucket suppression on every page and on submit;
personal holders retain their existing result exceptions, but the picker still
omits response IDs. Source Survey and target Finding Managed Systems may differ
inside one workspace; each gate is independent. Existing module-specific role,
explicit-deny and non-disclosing source 404 rules remain in force; no new User
Finding-read grant or Admin personal bypass is introduced.

The response-addressed create-Finding command retains explicit personal access.
Existing attached highlights retain their source-read audience, separately from
result-picker suppression, and require exact active approval plus fresh target
read/source access in one snapshot. Safe reads do not fabricate personal-read
audits; actual personal-data reads keep existing per-row audits. Raw audit SELECT
is revoked at #740 cutover without deleting Actor/detail history (FO ADR-0008).
Endpoint authority: `api/surveys.md` and `api/findings.md`.

## Cluster suggestions and paid preview (FO ADR-0068; BE shipped #1097/#1099)

Suggestion list/read: elevated `finding.read` on the pair's MS **and both VOCs**
readable through VOC's canonical scope-or-reporter rule. Suggestion mutations:
elevated `finding.manage` and both VOC reads; evaluate permission before replay.
No new capability or role bypass, and no partial pair/count leakage. Restore
additionally requires the original discard actor within five server minutes.
Owner settings remain `workspace.admin`. Paid preview needs only VOC create's
session/workspace authority, grants no candidate authority, and includes Admin
in paid budgets. Fresh candidate visibility is checked after egress/on replay.

Shared human event schemas registered by #1096 are `voc_cluster_suggestion_confirmed`,
`voc_cluster_suggestion_discarded`, `voc_cluster_suggestion_restored`, subject
`voc_cluster_suggestion/<UUID>`. The shared event registry/barrel exports all three
strict detail schemas; audit subjects remain strings (no new Core subject enum).
Human command producers ship in ADR item 2 (#1097). Confirm also emits
existing human Cluster create/member/update events in the same transaction;
no-op/replay writes no second event. Details contain pair/MS/revision/version/
hashes/score/cut and resulting Cluster reference, never prose/titles. Automatic
suggestion generation and read-only paid preview emit operational logs, no
`system.` event or domain audit. No new system actor is needed.

Platform saved-view events (#1105a, ADR-0099) are `saved_view_official_requested|approved|rejected|revoked`, `saved_view_visibility_changed`, `saved_view_group_created|updated` and `saved_view_import_submitted` (subjects `saved_view` / `saved_view_group`); details carry ids, version and counts only. The platform audit projection's subject allowlist is unchanged, so they are not returned by the platform audit trail.

## API tokens: scope ∩ permission, session-only capabilities (ADR-0116; #1442)

A Bearer API token (`Authorization: Bearer ap_<prefix>_<secret>`, `v0`, provisional) acts as its owning Actor: a personal token as its issuer, a service token as a `actor_type=system` Actor of the workspace. Authority is the **intersection** of the token's `scopes` (capability names) and the Actor's *current* permissions. Nothing is copied at issue: a revoked grant, a lost role or a deleted owner stops the next call.

Rules, applied inside `checkCapability`, `capabilityScope` and `resolveCapabilityScope` from the request's auth context (session calls are untouched):

1. Capability marked **session-only** → deny `session_required`, even when it appears in the scopes. Inside a token-callable menu port this is the port's normal judged denial: HTTP `200 { outcome: 'forbidden' }` (no `permission.session_required` code on the wire), audited as `api_token.session_required_denied` with `capability` set. The `403 permission.session_required` response exists only at the route level (below).
2. Capability not in the token's scopes → deny `token_scope` (never requestable); on the wire the same `200 { outcome: 'forbidden' }`.
3. Otherwise the normal check order above runs for the token's Actor.

The mirror rule (#1491): a capability marked **token-only** (`CAPABILITY_META[..].tokenOnly`, today `validation.catalog.report`) is denied `token_required` to a session, before any grant is read; a token with the scope falls through to rule 3. `applyAdminModuleBypass` returns `token_required` unchanged too. A token-only capability may appear in a token's scopes at issue.

`applyAdminModuleBypass` returns both token denials unchanged, so the Admin role cannot widen a token beyond its scopes. A role-level shortcut that is not a capability check (`features-access`, `every-session`) has no token path: a token reaches `every-session` menu permissions only through the `workspace.read` scope, and `features-access` only through the capability scopes.

**Deny by default.** A route is reachable with a token only when it sets `config.tokenCallable` (today `POST /api/v1/menu-query` and `POST /api/v1/menu-action`, whose declarations authorize through the capability check, `POST /api/v1/validation-catalog/report`, which checks `validation.catalog.report` itself, and `POST /api/v1/log-explorer/export`, which judges `explorer.export` itself). Every other route answers a token call `403 permission.session_required` (route-level refusal) and records `api_token.session_required_denied`. An `Authorization` header with the `Bearer` scheme (any case) and an empty, blank or malformed credential is a failed token authentication (`401 auth.token_invalid`), never a cookie fallback; only a header without the Bearer scheme leaves the request cookie-eligible. Rate limits: a token that authenticates has its own bucket (`<workspace>:token:<id>`; token `POST /api/v1/menu-action` calls a separate mutation-sized bucket, 10/min); every rejected authentication counts in the unauthenticated per-IP bucket.

**Session-only capabilities** (`CAPABILITY_META[..].sessionOnly`, `feature-shared/src/enums/capabilities.ts`): `workspace.admin` (permission grant / decision / revoke administration), `task_request.self_approve` (approval), `knowledge.item.publish`, `knowledge.spec.publish` (publication), `lifecycle.gate.decide` (Gate decision). Token issue/revoke are session-only endpoints, not capabilities. They cannot be listed as a scope at issue (`422 validation.failed`, `detail.fields[].code = session_only`; unknown names `unknown_capability`).

**Audit verbs** (`core.audit_log`, subject type `api_token`): `api_token.issue`, `api_token.revoke`, `api_token.auth_failed` (prefix only when parseable, internal reason, never the value), `api_token.session_required_denied` (also written, with `capability` set, when a token call on a callable route hits a session-only capability; the check only notes it in the request's auth context and the token gate writes the row before the response is sent). **Fail closed:** a token request whose auth context is lost (callback-style libraries, event emitters) is refused with a logged `500 internal.unexpected` before dispatch authorizes, never run as a cookie session. Every audit row written during a token call carries `detail.api_token_id` (added by the audit writer from the request context). A failed authentication whose token is unknown is attributed to the workspace's `system` Actor.

### Log explorer scopes, budget and export (#1472, design log-explorer §4.1)

- **Scopes** (separate, each chosen at issue): `explorer.source.read`, `explorer.export`, `explorer.investigate`, `explorer.handoff`. The issue alias «로그 탐색(조회)» is `explorer.source.read` alone; export is never part of an alias. Effective right = the Actor's *current* permission ∩ the scopes (rules above), plus the Source-owner rule `SourceOwnerAccess` judged on every call. A **service token** therefore reads or exports only when its system Actor holds the capability *and* an explicit Source-owner grant (admin-issued per ADR-0116); production grants no owner until the owner-scoped model exists (backlog row, #1469).
- **Entry right of a token read.** The `logExplorer.records|window|parsed|periods` declarations admit a token on the `explorer.source.read` scope alone (not the generic `workspace.read` token entry); the data right is still judged inside the read as for a session.
- **Daily body budget:** 50 MB of response bodies a day per token and per Actor (token calls; reads and exports together, UTC day). Over budget the call is refused whole (`explorer.budget_exceeded`), never cut. A session call is counted for the admin usage read but not limited by it.
- **Export:** 10,000 rows and 5 MB per request, 1 concurrent export and 20 a day per token and per Actor (the Actor-wide count holds session and token exports together). Refusals are codes, not cut files.
- **Revocation:** a revoked or expired token is refused at authentication on the next call; a reduced permission or revoked Source-owner grant at the next judgment; a running export stream is judged again at every chunk boundary and stops there.
- **Admin aggregation** `logExplorer.usage` is gated by `console:access` (`workspace.admin`, session-only, so no token can call it).
