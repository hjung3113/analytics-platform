import { describe, expect, it } from 'vitest';

import { searchHref } from '../search';

describe('searchHref', () => {
  it('drops undefined and empty values and keeps the given key order', () => {
    expect(searchHref('/vocs', { view: 'inbox', q: '', sort: undefined, selected: 'x' })).toBe(
      '/vocs?view=inbox&selected=x',
    );
  });

  it('returns the bare path for an empty record', () => {
    expect(searchHref('/vocs', { q: undefined })).toBe('/vocs');
  });
});
