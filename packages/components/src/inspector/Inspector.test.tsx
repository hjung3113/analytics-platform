import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Network, SlidersHorizontal, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { Inspector, type InspectorProps, type InspectorSection } from './Inspector';

const mounts: Record<string, number> = {};
function Probe({ id }: { id: string }) {
  useEffect(() => { mounts[id] = (mounts[id] ?? 0) + 1; }, [id]);
  return <button type="button">{`content ${id}`}</button>;
}
const SECTIONS: InspectorSection[] = [
  { id: 'target', title: { ko: '분석 대상', en: 'Target' }, icon: Target, summary: { ko: '선택 3', en: 'Selected 3' }, render: () => <Probe id="target" /> },
  { id: 'legend', title: { ko: '범례', en: 'Legend' }, icon: Network, summary: { ko: '표시 5', en: 'Visible 5' }, render: () => <Probe id="legend" /> },
  { id: 'options', title: { ko: '옵션', en: 'Options' }, icon: SlidersHorizontal, render: () => <Probe id="options" /> },
];
const BASE: InspectorProps = { sections: SECTIONS, form: 'stack', label: { ko: '분석 보조', en: 'Analysis inspector' } };
const shell = (props: Partial<InspectorProps> = {}) => <I18nProvider><Inspector {...BASE} {...props} /></I18nProvider>;

beforeEach(() => { for (const key of Object.keys(mounts)) delete mounts[key]; vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const header = (name: string) => screen.getByRole('button', { name });

describe('Inspector stack (APG accordion)', () => {
  it('puts each button in a heading with aria-expanded and aria-controls; all sections start open', () => {
    render(shell());
    for (const name of ['분석 대상', '범례', '옵션']) {
      const button = header(name);
      expect(button.closest('h3')).not.toBeNull();
      expect(button).toHaveAttribute('aria-expanded', 'true');
      const panel = document.getElementById(button.getAttribute('aria-controls')!);
      expect(panel).not.toBeNull();
      expect(panel).not.toHaveAttribute('role');
      expect(panel).toBeVisible();
    }
    expect(screen.getByRole('group', { name: '분석 보조' })).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it.each([['Enter'], [' ']])('toggles with the %j key and several sections stay open together', async key => {
    render(shell());
    const target = header('분석 대상');
    target.focus();
    // jsdom does not turn Enter/Space into a click, so the keys are exercised the way a browser does for a button.
    fireEvent.keyDown(target, { key });
    fireEvent.click(target);
    expect(target).toHaveAttribute('aria-expanded', 'false');
    expect(header('범례')).toHaveAttribute('aria-expanded', 'true');
    expect(header('옵션')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(target);
    expect(target).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a collapsed section summary in its header (ellipsis + title) and keeps the title unshrunk', () => {
    render(shell({ defaultExpanded: ['options'] }));
    const target = header('분석 대상');
    expect(target).toHaveAttribute('aria-expanded', 'false');
    const summary = within(target).getByText('선택 3');
    expect(summary).toHaveAttribute('title', '선택 3');
    expect(summary.className).toContain('truncate');
    expect(within(target).getByText('분석 대상').className).toContain('shrink-0');
    expect(target).toHaveAccessibleDescription('선택 3');
    fireEvent.click(target);
    expect(within(header('분석 대상')).queryByText('선택 3')).toBeNull();
  });

  it('scrolls as a whole: no section scrolls inside itself', () => {
    render(shell());
    expect(screen.getByRole('group', { name: '분석 보조' }).className).toContain('overflow-y-auto');
    for (const name of ['분석 대상', '범례', '옵션']) {
      const panel = document.getElementById(header(name).getAttribute('aria-controls')!)!;
      expect(panel.className).not.toMatch(/overflow|max-h/);
    }
  });

  it('keeps every section mounted when one is toggled', () => {
    render(shell());
    expect(mounts).toEqual({ target: 1, legend: 1, options: 1 });
    fireEvent.click(header('범례'));
    fireEvent.click(header('범례'));
    expect(mounts).toEqual({ target: 1, legend: 1, options: 1 });
  });

  it('controlled: the prop owns the set and onExpandedChange reports it in declaration order', () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(shell({ expanded: ['options'], onExpandedChange }));
    expect(header('옵션')).toHaveAttribute('aria-expanded', 'true');
    expect(header('분석 대상')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(header('분석 대상'));
    expect(onExpandedChange).toHaveBeenCalledWith(['target', 'options']);
    expect(header('분석 대상')).toHaveAttribute('aria-expanded', 'false');
    rerender(shell({ expanded: ['target', 'options'], onExpandedChange }));
    expect(header('분석 대상')).toHaveAttribute('aria-expanded', 'true');
  });

  it('persistKey restores the expanded set after a remount', () => {
    const first = render(shell({ persistKey: 'hw.l3' }));
    fireEvent.click(header('범례'));
    expect(localStorage.getItem('platform:inspector-expanded:hw.l3')).toBe('["target","options"]');
    first.unmount();
    render(shell({ persistKey: 'hw.l3' }));
    expect(header('범례')).toHaveAttribute('aria-expanded', 'false');
    expect(header('분석 대상')).toHaveAttribute('aria-expanded', 'true');
  });

  it('persistKey: another key keeps its own set; unknown stored ids are dropped', () => {
    localStorage.setItem('platform:inspector-expanded:other', '["legend","gone"]');
    render(shell({ persistKey: 'other' }));
    expect(header('범례')).toHaveAttribute('aria-expanded', 'true');
    expect(header('분석 대상')).toHaveAttribute('aria-expanded', 'false');
  });

  it('rejects an invalid persistKey like the other persist keys: console.error, nothing stored', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(shell({ persistKey: 'Bad Key' }));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[Inspector] persistKey "Bad Key" must match'));
    fireEvent.click(header('범례'));
    expect(localStorage.length).toBe(0);
  });
});

describe('Inspector rail (icon column + peek)', () => {
  const railShell = (props: Partial<InspectorProps> = {}) => shell({ form: 'rail', ...props });

  it('gives each section an icon button with its title as the accessible name', () => {
    render(railShell());
    for (const name of ['분석 대상', '범례', '옵션']) expect(header(name).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('group', { name: '분석 보조' }).className).toContain('w-10');
    expect(screen.queryByText('content target')).toBeNull();
  });

  it('shows a tooltip on keyboard focus', async () => {
    render(railShell());
    header('범례').focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('범례');
  });

  it('opens the peek with Enter, shows a non-colour selected marker, and runs only that section', async () => {
    render(railShell());
    const button = header('범례');
    button.focus();
    fireEvent.click(button); // Enter on a button is a click in browsers
    expect(await screen.findByText('content legend')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button.querySelector('span[aria-hidden]')).not.toBeNull();
    expect(mounts).toEqual({ legend: 1 });
  });

  it('closes the peek with Escape and returns focus to the same button', async () => {
    render(railShell());
    const button = header('범례');
    button.focus();
    fireEvent.click(button);
    const content = await screen.findByText('content legend');
    fireEvent.keyDown(content, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('content legend')).toBeNull());
    expect(document.activeElement).toBe(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps one peek open at a time and leaves the other sections unmounted', async () => {
    render(railShell());
    fireEvent.click(header('범례'));
    await screen.findByText('content legend');
    fireEvent.pointerDown(header('옵션'));
    fireEvent.click(header('옵션'));
    await screen.findByText('content options');
    await waitFor(() => expect(screen.queryByText('content legend')).toBeNull());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(mounts.target).toBeUndefined();
  });
});

describe('Inspector mounts (no query ownership)', () => {
  it('does not re-mount a stack section when a sibling toggles or the parent re-renders', () => {
    function Parent() {
      const [n, setN] = useState(0);
      return <>
        <button type="button" onClick={() => setN(n + 1)}>rerender</button>
        <I18nProvider><Inspector {...BASE} /></I18nProvider>
      </>;
    }
    render(<Parent />);
    fireEvent.click(screen.getByText('rerender'));
    fireEvent.click(header('옵션'));
    expect(mounts).toEqual({ target: 1, legend: 1, options: 1 });
  });

  it('switching form re-mounts only the section contents the new form shows, once', async () => {
    const { rerender } = render(shell());
    expect(mounts).toEqual({ target: 1, legend: 1, options: 1 });
    rerender(shell({ form: 'rail' }));
    expect(mounts).toEqual({ target: 1, legend: 1, options: 1 }); // the rail mounts none until a peek
    fireEvent.click(header('범례'));
    await screen.findByText('content legend');
    expect(mounts).toEqual({ target: 1, legend: 2, options: 1 });
  });
});
