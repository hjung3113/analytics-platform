import { describe, expect, it } from 'vitest';
import { spaceId } from '@ap/contracts';
import { initialManagedSystem } from './VocCompose';

const UUID = '33333333-3333-4333-8333-333333333333';
const FALLBACK = '44444444-4444-4444-8444-444444444444';
const fallback = (id: string | null) => id === 'metrics' ? FALLBACK : null;
const at = (space: string | null, carried: Record<string, string>) => initialManagedSystem({ spaceId: space === null ? null : spaceId(space), carried }, fallback);

describe('VOC compose initial Managed System (ADR-0070 decision 5)', () => {
  it('takes a feature screen\'s carried managedSystem when it is one UUID', () => {
    expect(at('operations', { managedSystem: UUID })).toBe(UUID);
  });

  it.each([['missing', {}], ['not a UUID', { managedSystem: 'billing' }], ['a list', { managedSystem: `${UUID},${FALLBACK}` }], ['empty', { managedSystem: '' }]])('falls back to the app mapping when it is %s', (_, carried) => {
    expect(at('operations', carried)).toBeNull();
  });

  it('takes a carried managedSystem on a global carry-set menu such as 내 Task, and uses managedSystemFor when nothing is carried', () => {
    expect(at(null, { managedSystem: UUID })).toBe(UUID);
    expect(at('metrics', { managedSystem: UUID })).toBe(UUID);
    expect(at('metrics', {})).toBe(FALLBACK);
    expect(at(null, {})).toBeNull();
  });
});
