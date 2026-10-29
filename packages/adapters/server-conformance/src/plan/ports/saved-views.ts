import type { Result, SavedViewDraft, SavedViewStore } from '@ap/contracts';
import type { ConformanceCheck, SavedViewPortMethod, ServerConformanceHarness } from '../../types';

/**
 * The SavedViewStore port (ADR-0099) — the one port this kit judges that is not a `PlatformAdapter` member, so the
 * sample names two stores instead of methods on `harness.adapter`: `user`, a plain owner without the approval
 * right, and `admin`, the approver (`console:access`). The kit writes its own views, groups and defaults through
 * the two stores, so the sample only names the stores and a menu id both sides accept; a server that has not
 * built the port supplies no sample and keeps a visible skip. The properties may be getters: they are read at
 * run time, never at plan time.
 */
export type SavedViewPortSamples = {
  user: SavedViewStore;
  admin: SavedViewStore;
  /** A menu id both implementations accept for the kit's menu-view drafts. */
  menuId: string;
};

/** Every `SavedViewStore` member: `uses` names these, and the sample's presence — not `implemented` — gates them. */
export const SAVED_VIEW_PORT_METHODS: readonly SavedViewPortMethod[] = [
  'list', 'get', 'save', 'update', 'remove', 'setDefault', 'getDefaultId', 'setVisibility', 'requestOfficial',
  'decide', 'revoke', 'listApprovalRequests', 'listGroups', 'createGroup', 'updateGroup', 'searchPeople',
];

// The decision values this suite exists to pin (#1131): the mock (apps/platform-web/src/saved-view-store.ts) and
// the server (apps/platform-api/src/modules/platform-saved-views) implement the ACL, messages and change summary
// separately, so the shared literals live here once — the side that drifts fails its check.
const NO_ACCESS = 'no-access';
const OTHERS_VIEW = '다른 사람의 뷰입니다. 복제해서 편집하세요.';
const OFFICIAL_NO_EDIT = '공식 게시본은 직접 편집할 수 없습니다. 변경하면 재승인을 요청합니다.';
const REVOKE_NOTE = '공식 게시가 회수되어 개인 비공개로 돌아왔습니다.';

export function planSavedViewChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const sample = harness.ports.savedViews;
  if (!sample) {
    return [{ id: 'savedViews: no sample', mode: 'skipped', uses: SAVED_VIEW_PORT_METHODS, run: async () => null }];
  }
  const checks: ConformanceCheck[] = [];
  let n = 0;
  const draft = (): SavedViewDraft => ({
    schemaVersion: 1,
    kind: 'menu-view',
    name: `적합성 ${++n}`,
    menuId: sample.menuId,
    menuSchemaVersion: 2,
    context: { relativePeriod: { hours: 24 } },
    page: { grain: ['hour'] },
    chartOptions: {},
    layout: null,
    panels: null,
  });
  /** The value of an ok call, or the failure line for the report (a string narrows the two apart). */
  const okOf = <T>(r: Result<T>, what: string): T | string =>
    r.ok ? r.value : `${what}: expected ok, got ${r.reason}${r.detail ? ` (${r.detail})` : ''}`;
  const want = (r: Result<unknown>, expected: 'conflict' | 'forbidden' | 'invalid', what: string): string | null =>
    !r.ok && r.reason === expected
      ? null
      : `${what}: expected ${expected}, got ${r.ok ? 'ok' : `${r.reason}${r.detail ? ` (${r.detail})` : ''}`}`;
  // Both actor ids, read from what each store issued — the store names the session user as the owner (ADR-0099 §2).
  let ids: Promise<{ user: string; admin: string } | string> | null = null;
  const actors = (user: SavedViewStore, admin: SavedViewStore) => ids ??= (async () => {
    const u = okOf(await user.save(draft()), "the user actor's first save");
    if (typeof u === 'string') return u;
    const a = okOf(await admin.save(draft()), "the admin actor's first save");
    if (typeof a === 'string') return a;
    return { user: u.view.ownerId, admin: a.view.ownerId };
  })();
  const idOf = (item: { denied?: false; view: { id: string } } | { denied: true; id: string }) =>
    item.denied === true ? item.id : item.view.id;

  // ADR-0099 §1·§6: reads re-judge the object ACL every time. Out of access is a denied entry in `get`, never a
  // leak and never null; `list` simply omits the view.
  checks.push({
    id: 'port · savedViews: a private view is invisible to the other actor — get is a denied entry, list omits it, unknown ids are null',
    uses: ['save', 'get', 'list'],
    mode: 'sequential',
    nonEnvelope: true,
    run: async () => {
      const { user, admin } = sample;
      const who = await actors(user, admin);
      if (typeof who === 'string') return who;
      const saved = okOf(await user.save(draft()), 'save');
      if (typeof saved === 'string') return saved;
      const view = saved.view;
      if (view.visibility.kind !== 'private' || view.approval !== 'none') return 'save answers a private view with approval none (SavedViewStore contract)';
      if (view.version !== 1 || typeof view.updatedAt !== 'number') return 'the store issues the first version and the timestamp (ADR-0099 §2)';
      const leaked = await admin.get(view.id);
      if (leaked === null || leaked.denied !== true) return `get of an existing view outside the actor's access answers the denied entry { id, denied: true, reason }, never null (ADR-0099 §1), got ${JSON.stringify(leaked)}`;
      if (leaked.id !== view.id || typeof leaked.reason !== 'string' || leaked.reason.length === 0) return `the denied entry is exactly { id, denied: true, reason }, got ${JSON.stringify(leaked)}`;
      if (leaked.reason !== NO_ACCESS) return `the out-of-access reason is '${NO_ACCESS}' (the server's value, ADR-0099 §6), got '${leaked.reason}'`;
      const listed = await admin.list({ userId: who.admin, menuId: sample.menuId });
      if (listed.some(item => idOf(item) === view.id)) return 'list never contains a view the actor cannot reach (ADR-0099 §6)';
      const mine = await user.get(view.id);
      if (mine === null || mine.denied === true) return 'the owner reads its own saved view back';
      const nowhere = await user.get('00000000-0000-0000-0000-000000000000');
      if (nowhere !== null) return 'get of an id that exists nowhere answers null';
      return null;
    },
  });

  // ADR-0099 §2: group membership is one access path — it grants the read union, never the write. Ownership
  // changes stay owner-only, and the approver's decisions on a view with no application are state errors.
  checks.push({
    id: 'port · savedViews: a group share grants read and copy, never write or share; ownership changes are owner-only',
    uses: ['createGroup', 'save', 'setVisibility', 'get', 'list', 'update', 'remove', 'requestOfficial', 'decide', 'revoke'],
    mode: 'sequential',
    nonEnvelope: true,
    run: async () => {
      const { user, admin } = sample;
      const who = await actors(user, admin);
      if (typeof who === 'string') return who;
      const group = okOf(await user.createGroup({ name: '적합성 공유 그룹', memberIds: [who.admin] }), 'createGroup');
      if (typeof group === 'string') return group;
      const saved = okOf(await user.save(draft()), 'save');
      if (typeof saved === 'string') return saved;
      const id = saved.view.id;
      const shared = okOf(await user.setVisibility(id, { kind: 'groups', groupIds: [group.group.id] }, { expectedVersion: saved.view.version }), 'setVisibility');
      if (typeof shared === 'string') return shared;
      const got = await admin.get(id);
      if (got === null || got.denied === true) return 'a group member reads the shared view — access is the union of paths (ADR-0099 §2)';
      if (got.view.id !== id) return `get answers the asked view, got ${got.view.id}`;
      const caps = got.capabilities;
      if (caps.canView !== true || caps.canCopy !== true) return 'a shared reader may view and copy';
      if (caps.canEdit !== false || caps.canShare !== false) return 'a plain group member never edits or reshare — a share grants read, not write';
      if (caps.reason !== OTHERS_VIEW) return `the no-edit reason is the shared copy message, got ${JSON.stringify(caps.reason)}`;
      if (!(await admin.list({ userId: who.admin, menuId: sample.menuId })).some(item => idOf(item) === id)) return "the shared view is in the member's list";
      const version = got.view.version;
      const outcomes: [string, Result<unknown>, 'forbidden' | 'invalid'][] = [
        ['update by the shared reader', await admin.update(id, { name: '남의 뷰' }, { expectedVersion: version }), 'forbidden'],
        ['remove by a non-owner', await admin.remove(id), 'forbidden'],
        ['requestOfficial by a non-owner', await admin.requestOfficial(id, { expectedVersion: version }), 'forbidden'],
        ['decide by the approver on a view nobody requested', await admin.decide(id, 'approve', undefined, { expectedVersion: version }), 'invalid'],
        ['revoke by the approver of a view that is not official', await admin.revoke(id, { expectedVersion: version }), 'invalid'],
      ];
      for (const [what, r, expected] of outcomes) {
        const bad = want(r, expected, what);
        if (bad) return bad;
      }
      return null;
    },
  });

  // ADR-0099 §6: a share target the actor cannot see is "unknown" like one that does not exist — the answer
  // never reveals which.
  checks.push({
    id: 'port · savedViews: sharing to an invisible or nonexistent group is invalid without revealing which',
    uses: ['createGroup', 'save', 'setVisibility'],
    mode: 'sequential',
    nonEnvelope: true,
    run: async () => {
      const { user, admin } = sample;
      const who = await actors(user, admin);
      if (typeof who === 'string') return who;
      const hidden = okOf(await admin.createGroup({ name: '적합성 비가시 그룹', memberIds: [who.admin] }), 'createGroup');
      if (typeof hidden === 'string') return hidden;
      const saved = okOf(await user.save(draft()), 'save');
      if (typeof saved === 'string') return saved;
      const targets: [string, string[]][] = [
        ['a group the actor cannot see', [hidden.group.id]],
        ['a group that does not exist', ['00000000-0000-0000-0000-000000000099']],
      ];
      for (const [what, groupIds] of targets) {
        const r = await user.setVisibility(saved.view.id, { kind: 'groups', groupIds }, { expectedVersion: saved.view.version });
        if (r.ok || r.reason !== 'invalid' || r.detail !== 'unknown group') return `${what}: expected invalid 'unknown group' — existence is not revealed (ADR-0099 §6), got ${JSON.stringify(r)}`;
      }
      return null;
    },
  });

  // ADR-0099 §2: the official tier walks request → approve → revoke. The application is a proposal the approver
  // lists with the change summary; revoke returns the view to the owner's private copy and drops everyone else's
  // default with it.
  checks.push({
    id: 'port · savedViews: the official tier — the application lists for the approver, approve publishes, revoke returns private and clears the default',
    uses: ['save', 'requestOfficial', 'listApprovalRequests', 'decide', 'get', 'setDefault', 'getDefaultId', 'revoke'],
    mode: 'sequential',
    nonEnvelope: true,
    run: async () => {
      const { user, admin, menuId } = sample;
      const who = await actors(user, admin);
      if (typeof who === 'string') return who;
      const saved = okOf(await user.save(draft()), 'save');
      if (typeof saved === 'string') return saved;
      const id = saved.view.id;
      const pending = okOf(await user.requestOfficial(id, { expectedVersion: saved.view.version }), 'requestOfficial');
      if (typeof pending === 'string') return pending;
      if (pending.view.approval !== 'pending' || pending.view.visibility.kind !== 'private') return 'asking for approval never changes who can see the view (SavedViewStore contract)';
      const requests = await admin.listApprovalRequests({ userId: who.admin, menuId });
      const request = requests.find(r => r.viewId === id);
      if (!request) return 'the approver sees the pending application (ADR-0099 §2)';
      if (request.requestedBy !== who.user) return `requestedBy is the owner, got ${request.requestedBy}`;
      if (request.targetVersion !== pending.view.version) return 'targetVersion is the version the approval would publish';
      if (JSON.stringify(request.changes) !== JSON.stringify([`공식 게시 신청: "${saved.view.name}"`])) return `the change summary of a first request is one line naming the view, got ${JSON.stringify(request.changes)}`;
      if (typeof request.requestedAt !== 'number') return 'requestedAt is a timestamp';
      const approved = okOf(await admin.decide(id, 'approve', undefined, { expectedVersion: pending.view.version }), 'decide(approve)');
      if (typeof approved === 'string') return approved;
      if (approved.view.approval !== 'approved' || approved.view.visibility.kind !== 'official') return 'approve publishes the official copy';
      const got = await admin.get(id);
      if (got === null || got.denied === true) return 'the official view is readable by everyone';
      if (got.capabilities.canEdit !== false || got.capabilities.reason !== OFFICIAL_NO_EDIT) return `the official copy is copy-only with the re-approval message, got ${JSON.stringify(got.capabilities)}`;
      const key = { userId: who.admin, menuId };
      const setBad = okOf(await admin.setDefault(key, id), 'setDefault');
      if (typeof setBad === 'string') return setBad;
      if ((await admin.getDefaultId(key)) !== id) return 'the default answers the id while the view is reachable';
      const revoked = okOf(await admin.revoke(id, { expectedVersion: approved.view.version }), 'revoke');
      if (typeof revoked === 'string') return revoked;
      if (revoked.view.approval !== 'none' || revoked.view.visibility.kind !== 'private') return 'revoke returns the view to private with approval none';
      if (revoked.view.approvalNote !== REVOKE_NOTE) return `revoke carries the fixed note, got ${JSON.stringify(revoked.view.approvalNote)}`;
      if ((await admin.getDefaultId(key)) !== null) return "a default whose access is lost answers null — it is not restored to or exposed for anyone else (ADR-0099 §2)";
      const after = await admin.get(id);
      if (after === null || after.denied !== true) return 'revoke removed the shared access — get is the denied entry again';
      const mine = await user.get(id);
      if (mine === null || mine.denied === true || mine.view.approval !== 'none' || mine.view.visibility.kind !== 'private') return 'the owner keeps the revoked view as a private one';
      return null;
    },
  });

  // The per-action outcome vocabulary (Result): conflict on a stale version with nothing written, invalid where
  // visibility is not an input, forbidden for another actor's key and for decisions without the approval right.
  checks.push({
    id: 'port · savedViews: outcome values per action — stale versions conflict, official visibility is not an input, other keys and rights are refused',
    uses: ['save', 'update', 'setVisibility', 'setDefault', 'getDefaultId', 'list', 'requestOfficial', 'decide', 'revoke', 'get'],
    mode: 'sequential',
    nonEnvelope: true,
    run: async () => {
      const { user, menuId } = sample;
      const who = await actors(user, sample.admin);
      if (typeof who === 'string') return who;
      const saved = okOf(await user.save(draft()), 'save');
      if (typeof saved === 'string') return saved;
      const id = saved.view.id;
      const version = saved.view.version;
      const stale = await user.update(id, { name: '늦은 수정' }, { expectedVersion: version + 1 });
      if (stale.ok || stale.reason !== 'conflict') return `a stale expectedVersion answers conflict and writes nothing, got ${JSON.stringify(stale)}`;
      const reread = await user.get(id);
      if (reread === null || reread.denied === true || reread.view.version !== version || reread.view.name !== saved.view.name) return 'the failed update changed nothing';
      const official = await user.setVisibility(id, { kind: 'official' }, { expectedVersion: version });
      if (official.ok || official.reason !== 'invalid' || official.detail !== 'use requestOfficial') return `official visibility is not an input — invalid 'use requestOfficial', got ${JSON.stringify(official)}`;
      const foreignKey = { userId: who.admin, menuId };
      const foreignSet = await user.setDefault(foreignKey, id);
      if (foreignSet.ok || foreignSet.reason !== 'forbidden') return `another actor's key is refused before anything is written, got ${JSON.stringify(foreignSet)}`;
      if ((await user.getDefaultId(foreignKey)) !== null) return "getDefaultId on another actor's key answers null";
      if ((await user.list(foreignKey)).length !== 0) return "list on another actor's key answers an empty array";
      const requested = okOf(await user.requestOfficial(id, { expectedVersion: version }), 'requestOfficial');
      if (typeof requested === 'string') return requested;
      for (const [what, r] of [
        ['decide without the approval right', await user.decide(id, 'approve', undefined, { expectedVersion: requested.view.version })],
        ['revoke without the approval right', await user.revoke(id, { expectedVersion: requested.view.version })],
      ] as const) {
        const bad = want(r, 'forbidden', what);
        if (bad) return bad;
      }
      return null;
    },
  });
  return checks;
}
