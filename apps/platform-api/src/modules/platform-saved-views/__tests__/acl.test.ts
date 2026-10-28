import { describe, expect, it } from 'vitest';

import {
  type ActorContext,
  type Standings,
  type ViewRecord,
  canTransition,
  capabilitiesOf,
  isOwnerOrManager,
  isReachable,
  proposalChanges,
  savedViewOf,
  visibilityOut,
} from '../acl.js';
import { asUuid, isPgSafeDeep, isPgSafeString } from '../safe.js';

const WS = 'ws';
const owner: ActorContext = { id: 'owner', workspaceId: WS, approver: false };
const other: ActorContext = { id: 'other', workspaceId: WS, approver: false };
const approver: ActorContext = { id: 'admin', workspaceId: WS, approver: true };
const none: Standings = new Map();

const view = (over: Partial<ViewRecord> = {}): ViewRecord => ({
  id: 'v1',
  ownerId: 'owner',
  kind: 'menu-view',
  menuId: 'm',
  name: 'Mine',
  content: {
    context: {},
    menuSchemaVersion: 1,
    page: [],
    chartOptions: {},
    layout: null,
    panels: null,
  },
  version: 3,
  updatedAt: 10,
  visibilityKind: 'private',
  approval: 'none',
  approvalNote: null,
  pending: null,
  people: [],
  groupIds: [],
  ...over,
});

describe('reachability: the union of object-ACL paths', () => {
  it('owner only for a private view', () => {
    expect(isReachable(view(), owner, none)).toBe(true);
    expect(isReachable(view(), other, none)).toBe(false);
    expect(isReachable(view(), approver, none)).toBe(false);
  });

  it('a named person, a group member, and official each open it; cutting one path keeps the others', () => {
    const people = view({ visibilityKind: 'people', people: ['other'] });
    expect(isReachable(people, other, none)).toBe(true);
    const grp = view({ visibilityKind: 'groups', groupIds: ['g1', 'g2'] });
    expect(isReachable(grp, other, new Map([['g1', { member: true, manager: false }]]))).toBe(true);
    expect(isReachable(grp, other, new Map([['g9', { member: true, manager: false }]]))).toBe(
      false,
    );
    expect(
      isReachable(view({ visibilityKind: 'official', approval: 'approved' }), other, none),
    ).toBe(true);
  });

  it('an approver reaches a private pending application, and a pending edit of an official copy', () => {
    expect(isReachable(view({ approval: 'pending' }), approver, none)).toBe(true);
    const official = view({
      visibilityKind: 'official',
      approval: 'approved',
      pending: { name: 'x', content: view().content, approval: 'pending', note: null },
    });
    expect(isReachable(official, approver, none)).toBe(true);
    expect(isReachable(view({ approval: 'rejected' }), approver, none)).toBe(false);
  });
});

describe('capabilities are separate per action', () => {
  it('owner edits and shares; an approver of someone else’s pending view can approve but not edit or share', () => {
    const pending = view({ approval: 'pending' });
    expect(capabilitiesOf(pending, owner, none)).toMatchObject({
      canEdit: true,
      canShare: true,
      canApprove: false,
      canRevoke: false,
    });
    expect(capabilitiesOf(pending, approver, none)).toMatchObject({
      canEdit: false,
      canShare: false,
      canApprove: true,
      canRevoke: false,
    });
  });

  it('only an approver revokes an approved official view; the owner cannot edit it directly', () => {
    const official = view({ visibilityKind: 'official', approval: 'approved' });
    expect(capabilitiesOf(official, approver, none).canRevoke).toBe(true);
    const asOwner = capabilitiesOf(official, owner, none);
    expect(asOwner).toMatchObject({ canEdit: false, canShare: false, canRevoke: false });
    expect(asOwner.reason).toBeDefined();
  });

  it('a group manager edits and shares; a plain member does not', () => {
    const grp = view({ visibilityKind: 'groups', groupIds: ['g1'] });
    expect(
      capabilitiesOf(grp, other, new Map([['g1', { member: false, manager: true }]])),
    ).toMatchObject({ canEdit: true, canShare: true });
    expect(
      capabilitiesOf(grp, other, new Map([['g1', { member: true, manager: false }]])),
    ).toMatchObject({ canEdit: false, canShare: false });
  });
});

describe('static relation used before the version check', () => {
  it('the owner and a group manager hold it whatever the approval state; a member, outsider or approver does not', () => {
    const standings: Standings = new Map([
      ['g1', { member: true, manager: true }],
      ['g2', { member: true, manager: false }],
    ]);
    const shared = (groupIds: string[]) => view({ visibilityKind: 'groups', groupIds });
    for (const approval of ['none', 'pending', 'approved'] as const) {
      expect(isOwnerOrManager(view({ approval }), owner, none)).toBe(true);
      expect(isOwnerOrManager(view({ approval }), approver, none)).toBe(false);
    }
    expect(isOwnerOrManager(shared(['g1']), other, standings)).toBe(true);
    expect(isOwnerOrManager(shared(['g2']), other, standings)).toBe(false);
    expect(isOwnerOrManager(view(), other, none)).toBe(false);
  });
});

describe('pending proposal and approved copy are separate', () => {
  const official = view({
    visibilityKind: 'official',
    approval: 'approved',
    pending: {
      name: 'Proposed',
      content: { ...view().content, layout: { a: 1 } },
      approval: 'pending',
      note: null,
    },
  });

  it('ordinary viewers see the approved copy; the owner and approvers see the proposal', () => {
    expect(savedViewOf(official, other, none)).toMatchObject({
      name: 'Mine',
      approval: 'approved',
    });
    expect(savedViewOf(official, owner, none)).toMatchObject({
      name: 'Proposed',
      approval: 'pending',
    });
    expect(savedViewOf(official, approver, none)).toMatchObject({
      name: 'Proposed',
      approval: 'pending',
    });
  });

  it('a rejected proposal is shown only to the owner and approvers, not to ordinary viewers', () => {
    const rejected = {
      ...official,
      pending: {
        ...(official.pending as NonNullable<ViewRecord['pending']>),
        approval: 'rejected' as const,
        note: 'no',
      },
    };
    expect(savedViewOf(rejected, other, none)).toMatchObject({
      name: 'Mine',
      approval: 'approved',
    });
    expect(savedViewOf(rejected, owner, none)).toMatchObject({
      approval: 'rejected',
      approvalNote: 'no',
    });
  });

  it('plain lines say what the application changes', () => {
    expect(proposalChanges(official)).toEqual(['이름 "Mine" → "Proposed"', '레이아웃 변경']);
    expect(proposalChanges(view({ approval: 'pending' }))).toEqual(['공식 게시 신청: "Mine"']);
  });
});

describe('visibility redaction', () => {
  it('a named person sees only themselves; the owner sees everyone', () => {
    const people = view({ visibilityKind: 'people', people: ['other', 'third'] });
    expect(visibilityOut(people, other, none)).toEqual({ kind: 'people', userIds: ['other'] });
    expect(visibilityOut(people, owner, none)).toEqual({
      kind: 'people',
      userIds: ['other', 'third'],
    });
  });
});

describe('approval transitions', () => {
  it.each([
    ['none', 'request', true],
    ['rejected', 'request', true],
    ['pending', 'request', false],
    ['pending', 'approve', true],
    ['approved', 'approve', false],
    ['approved', 'revoke', true],
    ['none', 'revoke', false],
  ] as const)('%s + %s → %s', (state, action, expected) => {
    expect(canTransition(state, action)).toBe(expected);
  });
});

describe('opaque input safety', () => {
  it('accepts uuids (any case) and refuses every other string', () => {
    expect(asUuid('0A1B2C3D-0000-4000-8000-000000000001')).toBe(
      '0a1b2c3d-0000-4000-8000-000000000001',
    );
    for (const bad of [
      '',
      'admin',
      "x'; drop table",
      '0a1b2c3d-0000-4000-8000-00000000000g',
      '\u0000',
    ])
      expect(asUuid(bad)).toBeNull();
  });

  it('rejects NUL and lone surrogates in values and in keys, at any depth', () => {
    expect(isPgSafeString('ok 한글 😀')).toBe(true);
    expect(isPgSafeString('a\u0000b')).toBe(false);
    expect(isPgSafeString('\ud800')).toBe(false);
    expect(isPgSafeDeep({ a: [{ b: 'fine' }] })).toBe(true);
    expect(isPgSafeDeep({ a: [{ b: 'bad\u0000' }] })).toBe(false);
    expect(isPgSafeDeep({ 'k\u0000': 1 })).toBe(false);
    expect(isPgSafeDeep({ a: ['\udc00'] })).toBe(false);
  });
});
