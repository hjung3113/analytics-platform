import { describe, expect, it } from 'vitest';

import { OUTCOMES } from '../envelope.js';
import { platformVocab } from './platform-vocab.js';

describe('envelope outcomes vs @ap/contracts/vocab.json', () => {
  it('lists the platform Outcome vocabulary exactly', () => {
    const { outcomes } = platformVocab();
    expect(outcomes.length).toBeGreaterThan(0);
    expect([...OUTCOMES].sort()).toEqual([...outcomes].sort());
  });
});
