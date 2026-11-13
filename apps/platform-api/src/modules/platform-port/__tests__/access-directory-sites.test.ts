// #2015 — the access directory's SiteGrant builder over the shared room-decision rule (no database).

import { describe, expect, it } from 'vitest';

import { parseScopeCatalog } from '../../permissions/scope-catalog.js';
import { buildSiteGrants } from '../access-directory.js';

const catalog = parseScopeCatalog([
  { site: 'SITE-A', label: 'Site A', rooms: ['RA2', 'RA1'] },
  { site: 'SITE-B', label: 'Site B', rooms: ['RB1'] },
]);
const row = (kind: string, site: string | null, room: string | null = null) => ({ kind, site, room });

describe('buildSiteGrants', () => {
  it('no grants → one zero-grant row per catalog site, in catalog order', () => {
    expect(buildSiteGrants(catalog, [])).toEqual([
      { id: 'SITE-A', label: 'Site A', grantedRooms: [], totalRooms: 2 },
      { id: 'SITE-B', label: 'Site B', grantedRooms: [], totalRooms: 1 },
    ]);
  });

  it('a site grant opens every catalog room in catalog order; a room grant its one room', () => {
    expect(buildSiteGrants(catalog, [row('site_room', 'SITE-B', 'RB1'), row('site', 'SITE-A')])).toEqual([
      { id: 'SITE-A', label: 'Site A', grantedRooms: ['RA2', 'RA1'], totalRooms: 2 },
      { id: 'SITE-B', label: 'Site B', grantedRooms: ['RB1'], totalRooms: 1 },
    ]);
  });

  it('overlapping site and room grants count each room once', () => {
    const [siteA] = buildSiteGrants(catalog, [row('site_room', 'SITE-A', 'RA1'), row('site', 'SITE-A')]);
    expect(siteA?.grantedRooms).toEqual(['RA2', 'RA1']);
  });

  it.each([
    ['a site outside the catalog', row('site', 'SITE-Z')],
    ['a room outside the catalog', row('site_room', 'SITE-A', 'RA9')],
    ['a room of another site', row('site_room', 'SITE-A', 'RB1')],
    ['a null site', row('site', null)],
    ['a room grant without a room', row('site_room', 'SITE-A', null)],
  ])('%s is dropped', (_name, grant) => {
    expect(buildSiteGrants(catalog, [grant]).flatMap((s) => s.grantedRooms)).toEqual([]);
  });
});
