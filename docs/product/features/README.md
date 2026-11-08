# Feature Product Documentation

`docs/product/features` holds product intent and system design contracts; authority follows subject (`docs/agents/feature-implementation.md` → Source Of Truth).

## Document Roles

- [00-product-overview.md](00-product-overview.md): product positioning, system map, non-negotiable interpretation rules.
- [01-domain-model.md](01-domain-model.md): entity ownership and system boundaries. Glossary and stable invariants live in root [`GLOSSARY.md`](../../../GLOSSARY.md).
- [02-requirements-matrix.md](02-requirements-matrix.md): requirement IDs, scope status, dependencies, and forbidden requirements.
- System documents, covering behavior, boundaries, workflows, permissions, and MVP exclusions: [03 core platform](03-core-platform.md), [04 VOC](04-voc-system.md), [05 Finding and Insight](05-finding-insight-system.md), [06 Task](06-task-project-system.md), [07 Survey](07-survey-system.md), [08 Dashboard](08-dashboard-system.md), [10 cross-system workflows](10-cross-system-workflows.md), [11 entity linking](11-entity-linking.md).
- [09-permission-access.md](09-permission-access.md): permission UX and what each role can do: default user can/cannot, and the only capability matrix. It does not own check order or audit event verbs; those are in [05-permission-policy.md](../../architecture/platform-api/05-permission-policy.md).
- [12-ui-ux-principles.md](12-ui-ux-principles.md): product-level UI intent and workflow traceability.
- [13-mvp-roadmap.md](history/13-mvp-roadmap.md): release grouping and recommended success flow of the shipped MVP. Historical record.
- [14-post-mvp-backlog.md](14-post-mvp-backlog.md): what the owner decided not to ship before the MVP release, and when to reopen each item.
- [15-data-contracts.md](15-data-contracts.md): field and enum authority. Not a draft, and not replaced by migrations.

Endpoint authority is `docs/architecture/platform-api/03-api-contracts.md` (index, global rules, error codes, contract template) together with `docs/architecture/platform-api/api/*.md` (behavior and catalog in the same domain file). No other document is an endpoint authority.

## Drift Control

```text
- System documents may explain local behavior, but must not redefine canonical entity names.
- Schema blocks in system documents are explanatory drafts.
- Field and enum contracts belong in docs/product/features/15-data-contracts.md. docs/architecture/platform-api/04-database-and-migrations.md owns migration mechanism only.
- Scope changes must update docs/product/features/02-requirements-matrix.md before roadmap prose.
- Do not copy the 09 capability matrix into docs/architecture/platform-api/05-permission-policy.md, and do not copy check order or audit verbs back into 09.
```
