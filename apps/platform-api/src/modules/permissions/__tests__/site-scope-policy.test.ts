import { describe, expect, it } from 'vitest';
import { assertScopeNarrowing, validateSiteScope } from '../site-scope-policy.js';
import { parseScopeCatalog } from '../scope-catalog.js';
const catalog = parseScopeCatalog([{ site: 'SITE-A', label: 'A', rooms: ['RA1', 'RA2'] }, { site: 'SITE-B', label: 'B', rooms: ['RA1'] }]);
const site = { kind: 'site', site: 'SITE-A', room: null };
const room = { kind: 'site_room', site: 'SITE-A', room: 'RA1' };
describe('Scope writes', () => {
  it('allows only scope.read site/room targets from the catalog', () => {
    expect(() => validateSiteScope('scope.read', room, null, null, null, catalog, 'requested_')).not.toThrow();
    expect(() => validateSiteScope('voc.read', room, null, null, null, catalog, '')).toThrow();
  });
  it('fails closed without a catalog', () => {
    expect(() => validateSiteScope('scope.read', room, null, null, null, undefined, '')).toThrow('scope catalog is not configured');
  });
  it.each([{...room, site:'GONE'}, {...room, room:'GONE'}])('rejects an unknown target', target => {
    expect(() => validateSiteScope('scope.read', target, null, null, null, catalog, 'requested_')).toThrow();
  });
  it('allows site-to-room narrowing in the same site', () => expect(() => assertScopeNarrowing(site, room)).not.toThrow());
  it.each([
    [room, site], [site, {...site, site:'SITE-B'}], [room, {...room, site:'SITE-B'}], [room, {...room, room:'RA2'}],
  ])('refuses widening or moving a target', (requested, granted) => {
    expect(() => assertScopeNarrowing(requested, granted)).toThrow('approval cannot move or widen requested scope');
  });
});
