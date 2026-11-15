import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LifecycleApi, Presentation, Project, ReadState, ScreenProps } from '../contracts';
import { ProjectScreen } from '../ProjectScreen';
import { ModelsScreen } from '../ModelsScreen';
import { RequestsScreen, QueueWindow } from '../RequestsScreen';
import { LifecycleHost } from '../host';

const project: Project = { id: 'project', modelId: 'model', model: { code: 'SYNTHETIC', name: 'Fixture', vendorName: 'Fixture' }, softwareId: null, stage: 'alpha', kind: 'new', owner: { id: 'actor', displayName: 'Fixture' }, targetDate: null, nextStages: ['beta', 'cancelled'], reopenTo: null, openRound: null, gateTarget: 'beta', gate: { latest: null }, version: '1' };
const page = vi.fn<Presentation['page']>(parts => <section data-testid="page"><h1>{parts.title}</h1>{parts.primaryAction && <button type="button">{parts.primaryAction.label}</button>}{parts.children}</section>);
const ui: Presentation = { page, table: () => null, drawer: () => null, timeline: () => null, trust: () => null };
function props(p = project): ScreenProps {
  const values: Record<string, unknown> = { projectDetail: p, rounds: { rows: [] }, models: { rows: [], total: 0 }, requests: { rows: [], total: 0 }, queueStatus: { runWindow: { timezone: 'Asia/Seoul', weekday: { fromHour: 9, toHour: 18 }, weekendAllDay: true }, immediateLimit: 2, serverAt: '2026-11-15T00:00:00Z', withinWindow: false } };
  const api: LifecycleApi = { useRead: <T,>(name: string): ReadState<T> => ({ status: 'done', data: values[name] as T, retry: vi.fn() }), useAction: () => ({ pending: false, run: vi.fn() }) };
  return { api, ui, actorId: 'actor', canProject: true, canRound: true, setSelection: vi.fn() };
}
afterEach(() => { cleanup(); page.mockClear(); });
describe('lifecycle page head', () => {
  it.each([
    [true, true, 'alpha', ['beta', 'cancelled'], null, '베타로 이동'],
    [true, true, 'alpha', ['cancelled', 'beta'], { id: 'round', seq: 1 }, '베타로 이동'],
    [true, true, 'alpha', ['cancelled'], null, 'Round 열기'],
    [false, true, 'alpha', ['beta'], null, 'Round 열기'],
    [false, true, 'alpha', ['beta'], { id: 'round', seq: 1 }, undefined],
    [true, false, 'alpha', ['cancelled'], null, undefined],
    [true, true, 'completed', [], null, undefined],
    [true, true, 'cancelled', [], null, undefined],
    [false, false, 'alpha', ['beta'], null, undefined],
  ] as const)('primary project=%s round=%s stage=%s next=%j open=%j', (canProject, canRound, stage, nextStages, openRound, label) => {
    render(<LifecycleHost navigate={vi.fn()}><ProjectScreen {...props({ ...project, stage, nextStages: [...nextStages], openRound })} projectId="project" canProject={canProject} canRound={canRound} /></LifecycleHost>);
    expect(page.mock.calls.at(-1)?.[0].primaryAction?.label).toBe(label);
    expect(screen.getAllByTestId('page')).toHaveLength(1);
  });
  it('declares disabled overflow reasons without hiding permission-limited actions', () => {
    render(<LifecycleHost navigate={vi.fn()}><ProjectScreen {...props()} projectId="project" canProject={false} canRound={false} /></LifecycleHost>);
    const actions = page.mock.calls.at(-1)?.[0].secondaryActions;
    expect(actions?.find(a => a.label === '개발 건 수정')).toMatchObject({ allowed: false, reason: '개발 건 관리 권한이 없습니다.' });
    expect(actions?.find(a => a.label === 'Round 열기')).toMatchObject({ allowed: false, reason: 'Round 관리 권한이 없습니다.' });
    expect(screen.queryByText('현재 단계')).toBeNull();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('알파');
  });
  it('keeps cancellation and reopening in secondary actions', () => {
    const view = render(<LifecycleHost navigate={vi.fn()}><ProjectScreen {...props()} projectId="project" /></LifecycleHost>);
    expect(page.mock.calls.at(-1)?.[0].secondaryActions?.some(a => a.label === '개발 건 취소')).toBe(true);
    view.rerender(<LifecycleHost navigate={vi.fn()}><ProjectScreen {...props({ ...project, stage: 'cancelled', nextStages: [], reopenTo: 'alpha' })} projectId="project" /></LifecycleHost>);
    expect(page.mock.calls.at(-1)?.[0].primaryAction).toBeUndefined();
    expect(page.mock.calls.at(-1)?.[0].secondaryActions?.some(a => a.label === '개발 건 재개')).toBe(true);
  });
  it.each([ModelsScreen, RequestsScreen])('declares exactly one page for a list', Component => {
    render(<LifecycleHost navigate={vi.fn()}><Component {...props()} /></LifecycleHost>);
    expect(screen.getAllByTestId('page')).toHaveLength(1);
  });
  it('keeps the outside-window warning visible in compact mode', () => {
    render(<QueueWindow api={props().api} compact />);
    expect(screen.getByText('시간대 밖')).toBeVisible();
    expect(screen.getByText(/실행 시간대 평일 09–18/)).toBeVisible();
  });
});
