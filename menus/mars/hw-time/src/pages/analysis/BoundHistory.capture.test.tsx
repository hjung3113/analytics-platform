// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { answer, renderOverview, requests } from './test-support';

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('shows translated fields, seconds and a synthetic name while preserving raw audit data and actor title', async () => {
  const event = {
    id: 'synthetic-htm-bound-change', at: '2026-09-19T09:00:00Z', actor: 'synthetic-engineer', action: 'update', source: 'user',
    target: { type: 'htm-bound', id: 'PM/PM1/Pump', scopeId: 'MEM' },
    changes: { upper: ['6', '7'], lower: ['1', '2'] }, actorName: { ko: '합성 작업자', en: 'Synthetic engineer' },
  };
  const original = structuredClone(event);
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=boundHistory', request =>
    request.endpoint === 'hwTime.boundHistory' ? { ...answer(request), data: [event] } : answer(request));
  const timeline = within(screen.getByRole('region', { name: '합성 HTM 기준 변경 이력' }));
  expect(timeline.getByText('합성 작업자').getAttribute('title')).toBe('synthetic-engineer');
  expect(timeline.getAllByRole('term').map(term => term.textContent)).toEqual(['HTM 상한', 'HTM 하한']);
  expect(timeline.getAllByRole('definition').map(value => value.textContent)).toEqual(['6.00 초 → 7.00 초', '1.00 초 → 2.00 초']);
  expect(event).toEqual(original);
});
