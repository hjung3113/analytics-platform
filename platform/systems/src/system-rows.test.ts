import { describe, expect, it } from 'vitest';
import type { ManagedSystemRow } from '@ap/feature-bridge';
import { systemRows } from './system-rows';

const system = (id: string, name: string, archived = false): ManagedSystemRow => ({ id, slug: id, name, externalKey: null, archived });
const SPACES = [{ id: 'mars', label: { ko: 'MARS', en: 'MARS' } }, { id: 'bravo', label: { ko: 'BRAVO', en: 'BRAVO' } }];

describe('systemRows', () => {
  it('lists 「플랫폼」 first, then linked systems in Registry order, then manual systems by name', () => {
    const rows = systemRows({
      links: [{ spaceId: 'bravo', managedSystemId: 'b', declared: true }, { spaceId: 'mars', managedSystemId: 'm', declared: true }],
      platformManagedSystemId: 'p',
      systems: [system('z', 'Zeta BI'), system('m', 'MARS'), system('p', '플랫폼'), system('a', 'Alpha BI'), system('b', 'BRAVO')],
    }, SPACES);
    expect(rows.map((row) => [row.kind, row.systemName, row.link])).toEqual([
      ['platform', '플랫폼', null], ['space', 'MARS', 'connected'], ['space', 'BRAVO', 'connected'], ['manual', 'Alpha BI', null], ['manual', 'Zeta BI', null],
    ]);
  });

  it('shows an undeclared link as disconnected, an archived disconnected system included', () => {
    const rows = systemRows({ links: [{ spaceId: 'mars', managedSystemId: 'm', declared: false }], platformManagedSystemId: null, systems: [system('m', 'MARS', true)] }, SPACES);
    expect(rows).toEqual([{ key: 'space:mars', kind: 'space', spaceId: 'mars', spaceLabel: SPACES[0]!.label, systemName: 'MARS', archived: true, link: 'disconnected' }]);
  });

  it('names a space the Registry does not hold by its id (label null) and keeps it after the Registry spaces', () => {
    const rows = systemRows({ links: [{ spaceId: 'gone', managedSystemId: 'g', declared: false }, { spaceId: 'mars', managedSystemId: 'm', declared: true }], platformManagedSystemId: null, systems: [system('g', 'Gone'), system('m', 'MARS')] }, SPACES);
    expect(rows.map((row) => [row.spaceId, row.spaceLabel?.ko ?? null])).toEqual([['mars', 'MARS'], ['gone', null]]);
  });

  it('a link to a system the list does not hold has no name instead of a guessed one', () => {
    const rows = systemRows({ links: [{ spaceId: 'mars', managedSystemId: 'missing', declared: true }], platformManagedSystemId: null, systems: [] }, SPACES);
    expect(rows[0]).toMatchObject({ systemName: null, archived: false });
  });

  it('keeps linked ids and 「플랫폼」 out of the manual set, and hides archived manual systems', () => {
    const rows = systemRows({
      links: [{ spaceId: 'mars', managedSystemId: 'm', declared: true }], platformManagedSystemId: 'p',
      systems: [system('m', 'MARS'), system('p', '플랫폼'), system('x', 'Old BI', true), system('y', 'Tableau')],
    }, SPACES);
    expect(rows.filter((row) => row.kind === 'manual').map((row) => row.systemName)).toEqual(['Tableau']);
  });

  it('draws no 「플랫폼」 row when the server has none', () => {
    expect(systemRows({ links: [], platformManagedSystemId: null, systems: [] }, SPACES)).toEqual([]);
  });
});
