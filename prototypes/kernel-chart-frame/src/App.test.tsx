import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { App } from './App';
import { AnnotationRepository } from './annotations';
// UI contract tests isolate SVG generation; plot.test.ts runs the real ECharts renderer.
vi.mock('./plot', async importOriginal => {
  const actual = await importOriginal<typeof import('./plot')>();
  return { ...actual, renderPlot: () => '<svg aria-hidden="true"></svg>' };
});
const button = (name: string) => screen.getByRole('button', { name });
const globalText = () => screen.getByLabelText('Global Context').textContent;
const viewport = () => screen.getByLabelText('Viewport').textContent;
function mount(repository = new AnnotationRepository()) { return { ...render(<App repository={repository}/>), repository, user: userEvent.setup() }; }
describe('AnalysisChartFrame contract', () => {
  it('renders frame regions and seven toolbar actions', () => {
    mount();
    expect(within(screen.getByRole('toolbar')).getAllByRole('button').map(b => b.textContent)).toEqual(['Zoom','Brush','Reset','Compare','Annotate','Export','More']);
    for (const region of ['Legend','Plot','Selection Summary','Persistent Annotation']) expect(screen.getByLabelText(region)).toBeTruthy();
    expect(screen.getByText(/Source: synthetic/).textContent).toContain('Coverage: 21/21');
    expect(screen.getByText(/Metric Version:/)).toBeTruthy();
  });
  it('keeps zoom and pan local and resets viewport explicitly', async () => {
    const { user } = mount(); const before = globalText(); const url = window.location.href;
    await user.click(button('Zoom')); expect(viewport()).toBe('5–15');
    await user.click(button('Pan right')); expect(viewport()).toBe('7–17');
    await user.click(button('Pan left')); expect(viewport()).toBe('5–15');
    expect(globalText()).toBe(before); expect(window.location.href).toBe(url);
    await user.click(button('Reset')); expect(viewport()).toBe('0–20');
  });
  it('page filter affects data but neither global nor local viewport', async () => {
    const { user } = mount(); const before = globalText(); const url = window.location.href;
    await user.click(button('Zoom'));
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '100' } });
    expect(screen.getByText(/Empty:/)).toBeTruthy(); expect(globalText()).toBe(before); expect(viewport()).toBe('5–15');
    await user.click(button('Reset')); expect((screen.getByLabelText('Threshold') as HTMLInputElement).value).toBe('100'); expect(window.location.href).toBe(url);
  });
  it('brush changes global only after explicit Apply and Reset preserves applied range', async () => {
    const { user } = mount(); const before = globalText();
    await user.click(button('Brush')); fireEvent.change(screen.getByLabelText('시작'), { target: { value: '3' } });
    expect(screen.getByLabelText('Brush range').textContent).toBe('3–12'); expect(globalText()).toBe(before);
    await user.click(button('적용')); expect(globalText()).toContain('3–12');
    fireEvent.change(screen.getByLabelText('끝'), { target: { value: '15' } }); expect(globalText()).toContain('3–12');
    await user.click(button('Reset')); expect(globalText()).toContain('3–12'); expect(screen.getByLabelText('Brush range').textContent).toBe('없음');
  });
  it('rejects reversed, empty and out-of-domain Brush without global mutation', async () => {
    const { user } = mount(); const before = globalText(); await user.click(button('Brush'));
    for (const value of ['15', '', '-1', '21']) {
      fireEvent.change(screen.getByLabelText('시작'), { target: { value } });
      expect((button('적용') as HTMLButtonElement).disabled).toBe(true); expect(screen.getByRole('alert')).toBeTruthy(); expect(globalText()).toBe(before);
    }
  });
  it('Compare distinguishes overlay legend and selection summary', async () => {
    const { user } = mount(); expect(screen.queryByLabelText('Synthetic B ┄ dashed')).toBeNull();
    await user.click(button('Compare')); expect(screen.getByLabelText('Synthetic B ┄ dashed')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('A, B');
    expect(screen.getByText(/Synthetic A: 21 points · Synthetic B: 21 points/)).toBeTruthy();
    await user.click(button('Compare')); expect(screen.getByRole('img').getAttribute('aria-label')).toBe('ECharts plot: A');
  });
  it('visibility is local and Reset restores series defaults', async () => {
    const { user } = mount(); const before = globalText();
    await user.click(screen.getByLabelText('Synthetic A — solid'));
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('표시 시리즈 없음'); expect(globalText()).toBe(before);
    await user.click(button('Reset')); expect(screen.getByRole('checkbox', { name: 'Synthetic A — solid' }).getAttribute('aria-checked')).toBe('true');
  });
  it('annotation repository survives Reset and remount independently of chart/page/global', async () => {
    const { user, repository, unmount } = mount();
    await user.click(button('Brush')); await user.click(button('적용')); await user.click(button('Annotate'));
    await user.type(screen.getByLabelText('주석 내용'), 'Fixture note'); await user.click(button('주석 저장'));
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '30' } });
    await user.click(button('Zoom')); await user.click(button('Reset'));
    expect(screen.getByText('4–12: Fixture note')).toBeTruthy(); expect(globalText()).toContain('4–12');
    expect((screen.getByLabelText('Threshold') as HTMLInputElement).value).toBe('30');
    expect(repository.list()).toEqual([{ id: 1, range: [4,12], text: 'Fixture note' }]);
    unmount(); render(<App repository={repository}/>); expect(screen.getByText('4–12: Fixture note')).toBeTruthy(); expect(viewport()).toBe('0–20');
  });
  it('remount cannot restore chart state through URL or global', async () => {
    const { user, unmount } = mount(); const url = window.location.href;
    await user.click(button('Zoom')); await user.click(button('Compare')); await user.click(button('Brush'));
    unmount(); render(<App repository={new AnnotationRepository()}/>);
    expect(viewport()).toBe('0–20'); expect(globalText()).toContain('없음'); expect(screen.getByLabelText('Brush range').textContent).toBe('없음');
    expect(button('Compare').getAttribute('aria-pressed')).toBe('false'); expect(window.location.href).toBe(url);
  });
  it('Export gives explicit stub feedback and More toggles details', async () => {
    const { user } = mount(); await user.click(button('Export')); expect(screen.getByText(/Export fixture:/)).toBeTruthy();
    await user.click(button('More')); expect(screen.getByText(/ECharts SVG ·/)).toBeTruthy();
    await user.click(button('More')); expect(screen.queryByText(/ECharts SVG ·/)).toBeNull();
  });
  it('empty annotation is rejected without adding a saved row', async () => {
    const { user, repository } = mount(); await user.click(button('Annotate')); await user.click(button('주석 저장'));
    expect(repository.list()).toEqual([]); expect(screen.getByText(/유효한 좌표 구간과 주석/)).toBeTruthy();
  });
  it('distinguishes an empty Brush from four threshold-filtered plot points', async () => {
    const { user } = mount();
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '50' } });
    expect(screen.getByText(/Synthetic A: 4 points/)).toBeTruthy();
    await user.click(button('Brush'));
    fireEvent.change(screen.getByLabelText('시작'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('끝'), { target: { value: '1' } });
    expect(screen.queryByText(/Empty:/)).toBeNull();
    expect(screen.getByText('Brush 범위 안에 데이터 없음')).toBeTruthy();
  });
  it('all hidden series are a selection state rather than Empty', async () => {
    const { user } = mount(); await user.click(button('Compare'));
    await user.click(screen.getByLabelText('Synthetic A — solid'));
    await user.click(screen.getByLabelText('Synthetic B ┄ dashed'));
    expect(screen.queryByText(/Empty:/)).toBeNull();
    expect(screen.getByText('선택된 series 없음')).toBeTruthy();
  });
  it('normal data has no empty or selection warning', () => {
    mount();
    expect(screen.queryByText(/Empty:|선택된 series 없음|Brush 범위 안에 데이터 없음/)).toBeNull();
    expect(screen.getByText(/Synthetic A: 21 points/)).toBeTruthy();
  });
  it('Empty follows Page Filter and viewport, independent of Brush', async () => {
    const { user } = mount();
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '57' } });
    expect(screen.queryByText(/Empty:/)).toBeNull();
    await user.click(button('Zoom')); await user.click(button('Zoom'));
    expect(screen.getByText(/Empty:/)).toBeTruthy();
    await user.click(button('Reset')); expect(screen.queryByText(/Empty:/)).toBeNull();
  });
  it('closing Brush discards draft and cannot apply or restore it on reopen', async () => {
    const { user } = mount(); await user.click(button('Brush'));
    fireEvent.change(screen.getByLabelText('시작'), { target: { value: '3' } });
    await user.click(button('적용')); const applied = globalText();
    await user.click(button('Brush'));
    expect(screen.getByLabelText('Brush range').textContent).toBe('없음');
    expect(screen.queryByRole('button', { name: '적용' })).toBeNull();
    expect(globalText()).toBe(applied);
    await user.click(button('Brush'));
    expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe('4');
    expect(screen.getByLabelText('Brush range').textContent).toBe('4–12');
    expect(globalText()).toBe(applied);
  });

});
