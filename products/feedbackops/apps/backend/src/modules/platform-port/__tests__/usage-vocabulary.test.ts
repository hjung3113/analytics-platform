import { describe, expect, it } from 'vitest';

import { PLATFORM_SPACE_IDS, PLATFORM_USAGE_VIA } from '../usage.js';
import { platformVocab } from './platform-vocab.js';

// ADR-0068 "one vocabulary": the root contracts' lists and this module's lists must not drift.
describe('usage vocabulary vs @ap/contracts/vocab.json', () => {
  it('UsageVia lists the contracts USAGE_VIAS exactly', () => {
    const { usageVias } = platformVocab();
    expect(usageVias.length).toBeGreaterThan(0);
    expect([...PLATFORM_USAGE_VIA].sort()).toEqual([...usageVias].sort());
  });

  it('SpaceId lists the contracts SPACE_IDS exactly', () => {
    const { spaceIds } = platformVocab();
    expect(spaceIds.length).toBeGreaterThan(0);
    expect([...PLATFORM_SPACE_IDS].sort()).toEqual([...spaceIds].sort());
  });
});
