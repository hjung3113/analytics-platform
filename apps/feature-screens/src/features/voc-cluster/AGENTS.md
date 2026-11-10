# VOC Cluster Feature Agent Guide

## Ownership

- Owns frontend route composition and mutations for VOC Cluster list, detail, membership management, cluster-to-existing-Finding association, and cluster-originated Create Finding / Request Task flows (hooks under `hooks/`).
- Does not own VOC record lifecycle, reporter-facing VOC status, or Finding/Task persistence — those belong to VOC, Findings, and Tasks respectively.
- The platform menu and bridge own URL wiring and after-create navigation; `src/test/clusters-host` preserves list/path-selection behavior in memory-router tests.
- Cluster detail owns `components/detail/VocClusterMemberRow.tsx` for its VOC member presentation; `EntityRelationRow` in Integration is reserved for Entity Link DTOs. The Request Task draft form itself is shared from `features/cross-system/request-task/`; Cluster keeps its source-specific mutation here.

## Route Boundary

- Owns `/voc-clusters` and `/voc-clusters/$clusterId` as semantic intents, mapped by the platform bridge.
- A VOC Cluster groups existing VOC records (domain relationship to VOC); it is a separate top-level feature from `features/voc/`, not a sub-route of it.

## Bridge safety (platform ADR-0071)

The list screen and detail parts are bridge-safe (entry `src/operator-screens/voc-clusters`, pinned in `packages/adapters/feature-bridge/src/feature-entry-graph.test.ts`):

- Reach navigation, links, and notices only through `lib/host`; import no router, `sonner`, `lib/auth`, or the `@/lib/api` barrel.
- Read `selected`/`managedSystem` from the host search (`lib/cluster-search.ts` holds the schema).
- Finding links render only when the host `canLink`s the path.

## Invariants

- A cluster confirms via `status: 'confirmed'`, not by implicit membership count.
- Membership add/remove must invalidate cluster detail; create/confirm must invalidate the cluster list.
- Create Finding / Request Task from a cluster follow the same approved application commands as their VOC-originated counterparts — no cluster-only bypass.
- Use list/detail layout and URL-selected detail state, consistent with VOC.
- Managed System is an optional list filter (`managed_system_id` query param on `useVocClusterList`), not a separate navigation tree.

## Close-out contract (FO ADR-0067)

Finding owner / Task Request assigned-reviewer creation inputs and results follow the destination commands; Cluster never invents target ownership/permissions. Preserve same-system/source visibility, pending/error states, and atomic provenance.

## Cluster suggestion review (FO ADR-0068)

Own the separate `Cluster 제안` section on the existing `/voc-clusters` ListShell: feature-local selection/panel/hooks and `lib/copy/voc-cluster.ts` wording. Review two currently authorized VOC texts, then `확인 후 Cluster 생성`, `기각`, or contextual `되돌리기`.

- A suggestion is not Cluster detail or a fake CLU ID, and offers no Finding/Task Request/member/bulk/link operations.
- Confirm creates a human-confirmed Cluster, invalidating suggestions, Cluster list, nav counts, and Recovery/Dashboard; discard/restore invalidate suggestions. Preserve existing Cluster URL state and manual flows.
- Hide a complete pair/count when either VOC is unreadable; never infer permission from labels.
- The fourth tab shows only for Admin/Developer after the shared suggestion read returns `available:true`. Loading, errors, and provider-disabled reads add no chrome. Availability loss returns to the default tab without changing Cluster URL state.
- The mounted suggestion session resets on tab/route exit or MS/workspace/actor change; Cluster panel drafts reset on conditional unmount. Undo records survive query replacement until their absolute server deadline; settlement after exit still invalidates caches but never restores local prose/focus. Stale/revoked notices contain no copied VOC text.
- Denied suggestion mutations (403/404) evict that id from every cached MS/all scope for the captured workspace/actor context, cancel obsolete reads, and invalidate those scopes even after session exit. Corrective reads never delay safe local notice handling.
- Each notice event moves focus after commit, including identical messages; closing its panel returns focus to the connected list.

## Verification

- When touched, test cluster list/detail route restore, member add/remove invalidation, confirm-cluster status transition, and cluster-to-Finding/Task creation flows.
