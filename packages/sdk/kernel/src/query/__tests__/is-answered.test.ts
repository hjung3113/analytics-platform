import { expect, it } from 'vitest';
import { OUTCOMES, isAnswered } from '@ap/contracts';

// The server answered with readable data only for `ok` and `empty`; every other outcome is a refusal or a failure (#2189).
it.each(OUTCOMES)('isAnswered(%s) is true exactly for ok and empty', outcome => {
  expect(isAnswered(outcome)).toBe(outcome === 'ok' || outcome === 'empty');
});
