// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { answer, renderOverview, requests } from './test-support';

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('opts all Bars into quiet summaries and moves scale captions into their descriptions', async () => {
  const components = await import('@ap/components');
  const frames = vi.spyOn(components, 'AnalysisChartFrame');
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM2&pins=moduleMotions');
  for (const [id, panelId] of [['hw-current', 'current'], ['hw-previous', 'previous'], ['hw-module-motions', 'moduleMotions']]) {
    const props = frames.mock.calls.filter(([p]) => p.chartId === id).at(-1)![0];
    expect(props).toMatchObject({ summary: 'quiet' });
    const { renderToStaticMarkup } = await import('react-dom/server');
    const description = renderToStaticMarkup(<>{props.description}</>);
    expect(description).toMatch(/합성 데이터/);
    expect(description).toMatch(/2개 설비/);
    expect(screen.getByRole('region', { name: `panel ${panelId}` }).querySelector('p.t-caption')).toBeNull();
  }
});

it('declares an icon for every non-primary workspace panel (#2435)', async () => {
  const components = await import('@ap/components');
  const workspaces = vi.spyOn(components, 'PanelWorkspace');
  await renderOverview('&moduleType=PM&drillModule=PM1&drillMotion=Chuck&pins=scatter&pins=heatmap&pins=distribution&pins=donut&pins=pareto&pins=equipmentDays&pins=boundHistory&pins=motionTable&pins=moduleMotions&pins=table', request => {
    if (['hwTime.matrix', 'hwTime.runs', 'hwTime.motionStats'].includes(request.endpoint)) return answer(request);
    return { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'icons-fixture' };
  });
  const panels = workspaces.mock.calls.at(-1)![0].panels;
  for (const panel of panels.filter(panel => !panel.primary)) expect(panel.icon, panel.id).toBeDefined();
});

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
])('draws the options at the start of the current Frame tool row, with no separate option or chip row, at %s (#2459)', async search => {
  const components = await import('@ap/components');
  const frames = vi.spyOn(components, 'AnalysisChartFrame');
  await renderOverview(search);
  const panel = screen.getByRole('region', { name: 'panel current' });
  const frame = within(panel).getByRole('region', { name: 'hw-current' });
  const toggle = within(panel).getByRole('button', { name: '시작 맞춤: 끔' });
  // Owner-confirmed variant B: one row above the plot holds the options and the plot tools.
  const start = toggle.closest('[data-chart-toolbar-start]')!;
  expect(start).not.toBeNull();
  expect(frame.contains(start)).toBe(true);
  // The Frame puts `toolbarStart` on its plot-tool row (SDK panelChrome test); here: the options travel through it, not a menu row.
  fireEvent.click(toggle);
  expect(within(start as HTMLElement).getByRole('button', { name: '시작 맞춤: 켬' }).getAttribute('aria-pressed')).toBe('true');
  expect(panel.querySelector('[data-panel-option-chips]')).toBeNull();
  const current = frames.mock.calls.filter(([props]) => props.chartId === 'hw-current').at(-1)![0];
  expect(current.extraActions).toBeUndefined();
  expect(current.toolbarStart).toBeDefined();
  expect(typeof current.title).toBe('string');
  if (search) {
    const previous = screen.getByRole('region', { name: 'panel previous' });
    expect(previous.querySelector('[data-chart-toolbar-start]')).toBeNull();
    expect(previous.querySelector('[data-panel-option-chips]')).toBeNull();
  }
});
