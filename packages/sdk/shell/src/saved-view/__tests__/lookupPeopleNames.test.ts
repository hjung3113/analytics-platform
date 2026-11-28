import { describe, expect, it, vi } from 'vitest';
import { PEOPLE_LOOKUP_MAX } from '@ap/contracts';
import { testAdapter } from '@ap/kernel/testing';
import { lookupPeopleNames } from '../lookupPeopleNames';

const person = (userId: string, displayName: string) => ({ userId, displayName, affiliation: '' });

describe('lookupPeopleNames', () => {
  it('splits requests at the port limit and passes the abort signal to every request', async () => {
    const ids = Array.from({ length: PEOPLE_LOOKUP_MAX + 1 }, (_, index) => `person-${index}`);
    const lookupPeople = vi.fn(async (chunk: readonly string[]) => chunk.map(id => person(id, id)));
    const { signal } = new AbortController();

    const names = await lookupPeopleNames(testAdapter({ lookupPeople }), ids, signal);

    expect(lookupPeople.mock.calls).toEqual([[ids.slice(0, PEOPLE_LOOKUP_MAX), signal], [ids.slice(PEOPLE_LOOKUP_MAX), signal]]);
    expect(names).toEqual(new Map(ids.map(id => [id, id])));
  });

  it('keeps successful results when a chunk fails', async () => {
    const unavailable = Array.from({ length: PEOPLE_LOOKUP_MAX }, (_, index) => `person-${index}`);
    const lookupPeople = async (chunk: readonly string[]) => {
      if (chunk.includes('person-0')) throw new Error('Directory unavailable');
      return [person('visible', 'Visible Person')];
    };

    const names = await lookupPeopleNames(testAdapter({ lookupPeople }), [...unavailable, 'visible'], new AbortController().signal);

    expect(names).toEqual(new Map([['visible', 'Visible Person']]));
  });

  it('omits empty display names so callers can fall back to the id', async () => {
    const lookupPeople = async () => [person('unnamed', ''), person('named', 'Named Person')];

    const names = await lookupPeopleNames(testAdapter({ lookupPeople }), ['unnamed', 'named'], new AbortController().signal);

    expect(names).toEqual(new Map([['named', 'Named Person']]));
  });
});
