import { describe, expect, it } from 'vitest';
import { parseScopeCatalog } from '../scope-catalog.js';

describe('parseScopeCatalog', () => {
  it('keeps catalog order, copies input and exposes closed lookups', () => {
    const input = [{ site: 'SITE-B', label: 'B', rooms: ['RB2', 'RB1'] }, { site: 'SITE-A', label: 'A', rooms: ['RA1'] }];
    const catalog = parseScopeCatalog(input);
    input[0]?.rooms.push('RB3');
    expect(catalog.sites).toEqual([{ site: 'SITE-B', label: 'B', rooms: ['RB2', 'RB1'] }, { site: 'SITE-A', label: 'A', rooms: ['RA1'] }]);
    expect(catalog.hasSite('SITE-A')).toBe(true);
    expect(catalog.hasSite('SITE-C')).toBe(false);
    expect(catalog.roomsOf('SITE-B')).toEqual(['RB2', 'RB1']);
    expect(catalog.roomsOf('SITE-C')).toEqual([]);
    expect(catalog.hasRoom('SITE-B', 'RB2')).toBe(true);
    expect(catalog.hasRoom('SITE-A', 'RB2')).toBe(false);
    expect(parseScopeCatalog([]).sites).toEqual([]);
  });

  it.each([
    [null, 'catalog: expected a list'],
    [[{}], 'entry 0: invalid site; entry 0: invalid label; entry 0: invalid rooms'],
    [[{ site: '', label: '', rooms: [''] }], 'entry 0: invalid site; entry 0: invalid label; entry 0: invalid room 0'],
    [[{ site: '  ', label: 'A', rooms: ['  '] }], 'entry 0: invalid site; entry 0: invalid room 0'],
    [[{ site: 'SITE-A', label: 'A', rooms: [] }], 'site SITE-A: no rooms'],
    [[{ site: 'SITE-A', label: 'A', rooms: ['RA1', 'RA1'] }], 'site SITE-A: duplicate room RA1'],
    [[{ site: 'SITE-A', label: 'A', rooms: ['RA1'] }, { site: 'SITE-A', label: 'B', rooms: ['RA2'] }], 'duplicate site SITE-A'],
    [[{ site: 'SITE-A', label: 1, rooms: [1] }], 'entry 0: invalid label; entry 0: invalid room 0'],
    [[{ site: 'SITE-A', label: 'private label', rooms: ['RA1', 'RA1'] }, { site: 'SITE-A', label: 'B', rooms: [] }], 'site SITE-A: no rooms; site SITE-A: duplicate room RA1; duplicate site SITE-A'],
  ])('refuses invalid catalogs with every problem and no label contents', (input, message) => {
    expect(() => parseScopeCatalog(input)).toThrow(new Error(message));
  });
});
