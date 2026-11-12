// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PermissionRequestTarget } from '@ap/contracts';
import { isPendingFor, type PendingRequestRow } from './access-request-match';

const SITE: PermissionRequestTarget = { kind: 'site', site: 'site-alpha' };
const ROOM: PermissionRequestTarget = { kind: 'site_room', site: 'site-alpha', room: 'room-one' };
const siteRow = (status: string, site = 'site-alpha'): PendingRequestRow => ({ status, requested_scope_kind: 'site', requested_scope_site: site, requested_scope_room: null });
const roomRow = (status: string, room: string, site = 'site-alpha'): PendingRequestRow => ({ status, requested_scope_kind: 'site_room', requested_scope_site: site, requested_scope_room: room });
const systemRow: PendingRequestRow = { status: 'pending', requested_scope_kind: 'managed_system', requested_scope_site: null, requested_scope_room: null };

describe('isPendingFor (ADR-0154 decision 6, advisor 1844e major 1)', () => {
  it.each<[string, PermissionRequestTarget, PendingRequestRow[], boolean]>([
    ['site place + pending site row', SITE, [siteRow('pending')], true],
    ['site place + pending room row of that site', SITE, [roomRow('pending', 'room-two')], true],
    ['room place + pending site row', ROOM, [siteRow('pending')], true],
    ['room place + pending row for the same room', ROOM, [roomRow('pending', 'room-one')], true],
    ['room place + pending row for another room of the same site', ROOM, [roomRow('pending', 'room-two')], false],
    ['site place + row for another site', SITE, [siteRow('pending', 'site-beta'), roomRow('pending', 'room-one', 'site-beta')], false],
    ['room place + row for another site', ROOM, [siteRow('pending', 'site-beta'), roomRow('pending', 'room-one', 'site-beta')], false],
    ['site place + needs_more_info site row (still open)', SITE, [siteRow('needs_more_info')], true],
    ['site place + approved site row', SITE, [siteRow('approved')], false],
    ['site place + rejected site row', SITE, [siteRow('rejected')], false],
    ['site place + cancelled site row', SITE, [siteRow('cancelled')], false],
    ['room place + approved, rejected and cancelled rows of that room', ROOM, [roomRow('approved', 'room-one'), roomRow('rejected', 'room-one'), roomRow('cancelled', 'room-one')], false],
    ['site place + a Managed System request', SITE, [systemRow], false],
    ['site place + no rows', SITE, [], false],
  ])('%s', (_name, target, rows, expected) => {
    expect(isPendingFor(target, rows)).toBe(expected);
  });

  it('answers null for a permission place (no scope rule)', () => {
    expect(isPendingFor({ kind: 'permission', permission: 'synthetic:view' as never }, [siteRow('pending')])).toBeNull();
  });
});
