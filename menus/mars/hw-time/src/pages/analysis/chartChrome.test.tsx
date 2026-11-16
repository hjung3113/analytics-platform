// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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
  await renderOverview('&moduleType=PM&drillModule=PM1&drillMotion=Chuck&pins=scatter&pins=heatmap');
  const kind = (id: string) => kinds.mock.calls.find(([props]) => props.chartId === id)![0];
  const frame = (id: string) => frames.mock.calls.find(([props]) => props.chartId === id)![0];
  expect(kind('hw-overview-matrix')).toMatchObject({ legendPlacement: 'top', toolsReveal: 'always' });
  expect(kind('hw-overview-matrix').legendCaption).toBeUndefined();
  expect(frame('hw-current')).toMatchObject({ legend: false, legendPlacement: 'bottom', toolsReveal: 'always' });
  expect(frame('hw-previous')).toMatchObject({ legend: false, toolsReveal: 'always' });
  // #2416: the narrow previous-step panel sizes its row-name gutter to the names instead of the fixed 140 px.
  expect(frame('hw-previous').rowLabelWidth).toBe('auto');
  expect(frame('hw-current').rowLabelWidth).toBe('auto');
  expect(kind('hw-overview-runs-scatter')).toMatchObject({ legendPlacement: 'bottom', toolsReveal: 'always' });
  expect(kind('hw-overview-runs-scatter').legendCaption).toMatch(/합성 데이터/);
  // The existing fixture has one date: #2426 intentionally replaces this chart with one empty-state line.
  expect(frames.mock.calls.some(([props]) => props.chartId === 'hw-overview-runs-trend')).toBe(false);
});

it.each([
  ['', { ko: '설비별 Module 타입 평균', en: 'Mean Module type time by equipment' }, null],
  ['&moduleType=PM', { ko: 'PM · 설비–Module별 Motion', en: 'PM · Motions by equipment–Module' },
    { ko: '설비별 Module 타입 평균 · 앞 단계', en: 'Mean Module type time by equipment · Previous step' }],
  ['&moduleType=PM&drillMotion=Pump', { ko: 'PM · Pump · 설비–Module별', en: 'PM · Pump · Equipment–Module' },
    { ko: 'PM · 설비–Module별 Motion · 앞 단계', en: 'PM · Motions by equipment–Module · Previous step' }],
  ['&moduleType=PM&drillMotion=Pump&drillModule=PM2', { ko: 'PM2 · Pump · 설비별', en: 'PM2 · Pump · By equipment' },
    { ko: 'PM · Pump · 설비–Module별 · 앞 단계', en: 'PM · Pump · Equipment–Module · Previous step' }],
] as const)('names the workspace panels after their chart at %s in both languages', async (search, current, previous) => {
  const components = await import('@ap/components');
  const workspaces = vi.spyOn(components, 'PanelWorkspace');
  const frames = vi.spyOn(components, 'AnalysisChartFrame');
  await renderOverview(search);
  const panels = workspaces.mock.calls.at(-1)![0].panels;
  expect(panels.find(panel => panel.id === 'current')?.title).toEqual(current);
  expect(panels.find(panel => panel.id === 'previous')?.title ?? null).toEqual(previous);
  expect(frames.mock.calls.filter(([props]) => props.chartId === 'hw-current').at(-1)![0].title).toBe(current.ko);
  if (previous) expect(frames.mock.calls.filter(([props]) => props.chartId === 'hw-previous').at(-1)![0].title).toBe(previous.ko);
});

it.each([
  '', '&moduleType=PM', '&moduleType=PM&drillMotion=Pump', '&moduleType=PM&drillMotion=Pump&drillModule=PM2',
])('keeps options and changed chips together above and outside the current Frame at %s', async search => {
  const components = await import('@ap/components');
  const frames = vi.spyOn(components, 'AnalysisChartFrame');
  await renderOverview(search);
  const panel = screen.getByRole('region', { name: 'panel current' });
  const frame = within(panel).getByRole('region', { name: 'hw-current' });
  const toggle = within(panel).getByRole('button', { name: '시작 맞춤: 끔' });
  expect(frame.contains(toggle)).toBe(false);
  expect(toggle.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(panel.querySelector('[data-panel-option-chips]')).toBeNull();
  fireEvent.click(toggle);
  const chips = panel.querySelector<HTMLUListElement>('[data-panel-option-chips]')!;
  expect(chips).not.toBeNull();
  expect(within(chips).getByText('시작 맞춤')).toBeTruthy();
  expect(frame.contains(chips)).toBe(false);
  const row = toggle.parentElement!.parentElement!;
  expect(row.contains(chips)).toBe(true);
  expect(chips.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(row.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const current = frames.mock.calls.filter(([props]) => props.chartId === 'hw-current').at(-1)![0];
  expect(current.extraActions).toBeUndefined();
  expect(typeof current.title).toBe('string');
  if (search) expect(screen.getByRole('region', { name: 'panel previous' }).querySelector('[data-panel-option-chips]')).toBeNull();
});
