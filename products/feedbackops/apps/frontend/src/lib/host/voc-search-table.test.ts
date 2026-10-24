import { describe, expect, it } from 'vitest';

import { validateVocSearch } from '@/features/voc/routes/voc-search';

const UUID = '3f2b8a1e-5c4d-4e6f-8a9b-0c1d2e3f4a5b';

describe('validateVocSearch parse table (router-free copies)', () => {
  it.each([
    [
      'valid keys pass through',
      { view: 'triage', selected: UUID, q: 'abc' },
      { view: 'triage', selected: UUID, q: 'abc' },
    ],
    ['unknown view is dropped', { view: 'nope', q: 'a' }, { view: undefined, q: 'a' }],
    ['non-uuid selected is dropped', { selected: 'x' }, { selected: undefined }],
    ['q over 100 chars is dropped', { q: 'a'.repeat(101) }, { q: undefined }],
    ['q of 100 chars stays', { q: 'a'.repeat(100) }, { q: 'a'.repeat(100) }],
    ['unknown key is dropped', { bogus: '1', view: 'my' }, { bogus: undefined, view: 'my' }],
    [
      'analytics_area accepts unset',
      { 'filter.analytics_area': 'unset' },
      { 'filter.analytics_area': 'unset' },
    ],
    [
      'analytics_area rejects a non-uuid',
      { 'filter.analytics_area': 'x' },
      { 'filter.analytics_area': undefined },
    ],
    ['returnTo accepts an allowed queue return', { returnTo: '/home' }, { returnTo: '/home' }],
    [
      'returnTo rejects an external target',
      { returnTo: '//evil.example' },
      { returnTo: undefined },
    ],
    ['returnTo rejects another internal path', { returnTo: '/vocs' }, { returnTo: undefined }],
    [
      'platformReturn accepts https',
      { platformReturn: 'https://p.example/x' },
      { platformReturn: 'https://p.example/x' },
    ],
    [
      'platformReturn rejects credentials',
      { platformReturn: 'https://u:p@p.example/' },
      { platformReturn: undefined },
    ],
    [
      'platformReturn rejects javascript:',
      { platformReturn: 'javascript:alert(1)' },
      { platformReturn: undefined },
    ],
    [
      'platformReturn accepts local http',
      { platformReturn: 'http://localhost:5173/' },
      { platformReturn: 'http://localhost:5173/' },
    ],
    ['non-object input yields no keys', 'x', {}],
  ])('%s', (_name, raw, expected) => {
    expect(validateVocSearch(raw)).toEqual(expected);
  });
});
