import { describe, expect, it } from 'vitest';

import { getTableConfig } from 'drizzle-orm/pg-core';

import { usageEvents } from '../../../db/schema/platform.js';
import { PLATFORM_USAGE_VIA } from '../usage.js';
import { platformVocab } from './platform-vocab.js';

// platform ADR-0068 "one vocabulary": the root contracts' lists and this module's lists must not drift.
describe('usage vocabulary vs @ap/contracts/vocab.json', () => {
  it('UsageVia lists the contracts USAGE_VIAS exactly', () => {
    const { usageVias } = platformVocab();
    expect(usageVias.length).toBeGreaterThan(0);
    expect([...PLATFORM_USAGE_VIA].sort()).toEqual([...usageVias].sort());
  });

  it('the usage_events_via_check constraint lists PLATFORM_USAGE_VIA exactly', () => {
    const check = getTableConfig(usageEvents).checks.find((c) => c.name === 'usage_events_via_check');
    const sqlText = (check?.value.queryChunks ?? []).map((c) => (typeof c === 'object' && c !== null && 'value' in c ? String((c as { value: unknown }).value) : '')).join('');
    const listed = [...sqlText.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...PLATFORM_USAGE_VIA].sort());
  });
});
