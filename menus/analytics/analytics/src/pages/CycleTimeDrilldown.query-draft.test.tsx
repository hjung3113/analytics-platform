// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { MenuQuery } from '@ap/contracts';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import CycleTimeDrilldown from './CycleTimeDrilldown';

const registry = createRegistry({ spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: 'analytics:view', homeMenuId: 'productivity-overview' }], groups: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, icon: Timer, space: 'analytics' }], menus: manifests });
function Apply() { const query = useQueryDraft(); return <button onClick={query.apply} disabled={!query.canApply}>Apply query</button>; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('keeps page edits in draft until the single apply, preserving applied requests and URL', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  const session = testSession(['analytics:view', 'platform:view']);
  const send = vi.fn(async (_request: MenuQuery) => ({ outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'test' }));
  window.history.replaceState(null, '', '/analytics/cycle-time?scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
  const push = vi.spyOn(window.history, 'pushState');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, menuQuery: send })} slots={{ contextBar: <Apply /> }}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(new Set(send.mock.calls.map(([request]) => request.endpoint))).toEqual(new Set(['analytics.cycle.kpi', 'analytics.cycle.trend', 'analytics.cycle.dist', 'analytics.cycle.slow'])));
  const before = send.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '일' }));
  expect(window.location.search).not.toContain('granularity');
  expect(send).toHaveBeenCalledTimes(before);
  expect(screen.getByRole('button', { name: '일' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Apply query' }));
  await waitFor(() => expect(window.location.search).toContain('granularity=day'));
  expect(push).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(send.mock.calls.filter(([request]) => request.endpoint === 'analytics.cycle.slow')).toHaveLength(2));
  expect(send.mock.calls.filter(([request]) => request.endpoint === 'analytics.cycle.trend')).toHaveLength(2);
  // Count real adapter requests, independently for each endpoint and complete identity.
  const counts = new Map<string, number>();
  for (const [request] of send.mock.calls) {
    const identity = JSON.stringify(request);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  for (const count of counts.values()) expect(count).toBe(1);
  const settled = send.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Apply query' }));
  expect(push).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(settled);
});
