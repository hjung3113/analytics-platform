// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { renderOverview, requests } from './test-support';

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('declares the owner-picked chart chrome per panel with captions only on the bottom legends', async () => {
  const components = await import('@ap/components');
  const kinds = vi.spyOn(components, 'AnalysisChart');
  const frames = vi.spyOn(components, 'AnalysisChartFrame');
  await renderOverview('&drillModule=PM1&drillMotion=Chuck');
  const kind = (id: string) => kinds.mock.calls.find(([props]) => props.chartId === id)![0];
  const frame = (id: string) => frames.mock.calls.find(([props]) => props.chartId === id)![0];
  expect(kind('hw-overview-matrix')).toMatchObject({ legendPlacement: 'top', toolsReveal: 'always' });
  expect(kind('hw-overview-matrix').legendCaption).toBeUndefined();
  expect(frame('hw-overview-bars')).toMatchObject({ legendPlacement: 'bottom', toolsReveal: 'always' });
  expect(frame('hw-overview-bars').legendCaption).toMatch(/합성 데이터.*판정 불가/);
  expect(kind('hw-overview-runs-scatter')).toMatchObject({ legendPlacement: 'bottom', toolsReveal: 'always' });
  expect(kind('hw-overview-runs-scatter').legendCaption).toMatch(/합성 데이터/);
  expect(frame('hw-overview-runs-trend')).toMatchObject({ legendPlacement: 'side', toolsReveal: 'hover' });
  expect(frame('hw-overview-runs-trend').legendCaption).toBeUndefined();
});
