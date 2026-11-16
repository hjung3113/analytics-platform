// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuditEvent } from '@ap/contracts';
import { memoryStorage } from '@ap/kernel/testing';
import { answer, renderOverview, requests } from './test-support';

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('preserves the audit actor and before/after values when the SDK has no display resolvers', async () => {
  const event: AuditEvent = {
    id: 'synthetic-htm-bound-change', at: '2026-09-19T09:00:00Z', actor: 'synthetic-engineer', action: 'update', source: 'user',
    target: { type: 'htm-bound', id: 'PM/PM1/Pump', scopeId: 'MEM' },
    changes: { upper: ['6', '7'], lower: ['1', '2'] },
  };
  const original = structuredClone(event);
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=boundHistory', request =>
    request.endpoint === 'hwTime.boundHistory' ? { ...answer(request), data: [event] } : answer(request));
  const timeline = within(screen.getByRole('region', { name: '합성 HTM 기준 변경 이력' }));
  expect(timeline.getByText('synthetic-engineer')).toBeTruthy();
  // Characterizes the current SDK gap, not acceptance of the requested translated field labels.
  expect(timeline.getAllByRole('term').map(term => term.textContent)).toEqual(['upper', 'lower']);
  expect(timeline.getAllByRole('definition').map(value => value.textContent)).toEqual(['6 → 7', '1 → 2']);
  expect(event).toEqual(original);
});
