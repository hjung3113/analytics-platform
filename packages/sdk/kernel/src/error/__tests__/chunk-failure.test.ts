import { describe, expect, it } from 'vitest';
import { isChunkLoadFailure } from '../chunkFailure';

describe('isChunkLoadFailure (#1981, #2025)', () => {
  it.each([
    ['Chrome', new TypeError('Failed to fetch dynamically imported module: /assets/x.js')],
    ['Firefox', new TypeError('error loading dynamically imported module: /assets/x.js')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['webpack name', Object.assign(new Error('x'), { name: 'ChunkLoadError' })],
    ['a wrapper keeping it as cause', new Error('wrapped', { cause: new TypeError('Failed to fetch dynamically imported module: /a.js') })],
  ])('%s is a chunk-load failure', (_name, error) => { expect(isChunkLoadFailure(error)).toBe(true); });

  it.each([
    ['a render error', new Error('boom')],
    ['a wrapper of a render error', new Error('wrapped', { cause: new Error('boom') })],
    ['a non-error value', 'Failed to fetch dynamically imported module'],
    ['a cause chain deeper than the limit', new Error('a', { cause: new Error('b', { cause: new Error('c', { cause: new Error('d', { cause: new Error('e', { cause: new TypeError('Failed to fetch dynamically imported module') }) }) }) }) })],
  ])('%s is not', (_name, error) => { expect(isChunkLoadFailure(error)).toBe(false); });
});
