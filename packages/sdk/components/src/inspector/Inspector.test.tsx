import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Network, SlidersHorizontal, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
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

const features = { export: false, savedView: false, annotate: false, compare: false };
const menu = (id: string, path: string) => ({ id, group: groupId('overview'), primary: id === 'home', label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, features, pageKeys: [] });
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [menu('home', '/'), menu('other', '/other')],
});
/** The Inspector inside a platform: `user` and the URL path (`/` = menu home, `/other` = menu other) decide the storage scope. */
const platformShell = (props: Partial<InspectorProps> = {}, user = 'u1') => {
  const session = testSession(['platform:view'], { user: { id: user, name: user, title: { ko: user, en: user } } });
  return <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Inspector {...BASE} {...props} /></PlatformProvider></I18nProvider>;
};
const SCOPED = (persistKey: string, user = 'u1', menuId = 'home') => `platform:inspector-expanded:v1:${user}:${menuId}:${persistKey}`;

beforeEach(() => { for (const key of Object.keys(mounts)) delete mounts[key]; vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

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

  it('persistKey restores the expanded set after a remount (same user and menu)', () => {
    const first = render(platformShell({ persistKey: 'hw.l3' }));
    fireEvent.click(header('범례'));
    expect(localStorage.getItem(SCOPED('hw.l3'))).toBe('["target","options"]');
    first.unmount();
    render(platformShell({ persistKey: 'hw.l3' }));
    expect(header('범례')).toHaveAttribute('aria-expanded', 'false');
    expect(header('분석 대상')).toHaveAttribute('aria-expanded', 'true');
  });

  it('persistKey: another key keeps its own set; unknown stored ids are dropped', () => {
    localStorage.setItem(SCOPED('other'), '["legend","gone"]');
    render(platformShell({ persistKey: 'other' }));
    expect(header('범례')).toHaveAttribute('aria-expanded', 'true');
    expect(header('분석 대상')).toHaveAttribute('aria-expanded', 'false');
  });

  it('isolates the same persistKey across two menus', () => {
    const first = render(platformShell({ persistKey: 'l3' }));
    fireEvent.click(header('범례'));
    first.unmount();
    window.history.replaceState(null, '', '/other');
    render(platformShell({ persistKey: 'l3' }));
    for (const name of ['분석 대상', '범례', '옵션']) expect(header(name)).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem(SCOPED('l3', 'u1', 'other'))).toBeNull();
    expect(localStorage.getItem(SCOPED('l3'))).toBe('["target","options"]');
  });

  it('isolates the same persistKey and menu across two users', () => {
    const first = render(platformShell({ persistKey: 'l3' }, 'u1'));
    fireEvent.click(header('범례'));
    first.unmount();
    render(platformShell({ persistKey: 'l3' }, 'u2'));
    for (const name of ['분석 대상', '범례', '옵션']) expect(header(name)).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem(SCOPED('l3', 'u2'))).toBeNull();
  });

  it('stores nothing without a platform (no user, no menu): the set stays in memory', () => {
    render(shell({ persistKey: 'l3' }));
    fireEvent.click(header('범례'));
    expect(header('범례')).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.length).toBe(0);
  });

  it('rejects an invalid persistKey like the other persist keys: console.error, nothing stored', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(platformShell({ persistKey: 'Bad Key' }));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[Inspector] persistKey "Bad Key" must match'));
    fireEvent.click(header('범례'));
    expect(Object.keys(localStorage).filter(key => key.startsWith('platform:inspector'))).toEqual([]);
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

  it('shows the section title as a visible heading that names the peek dialog', async () => {
    render(railShell());
    fireEvent.click(header('범례'));
    const dialog = await screen.findByRole('dialog', { name: '범례' });
    const heading = within(dialog).getByRole('heading', { name: '범례' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(dialog.firstElementChild).toBe(heading);
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

describe('Inspector render callbacks (closed sections are never called)', () => {
  const spies = () => {
    const calls = { target: vi.fn(() => <Probe id="target" />), legend: vi.fn(() => <Probe id="legend" />), options: vi.fn(() => <Probe id="options" />) };
    const sections = SECTIONS.map(section => ({ ...section, render: calls[section.id as keyof typeof calls] }));
    return { calls, sections };
  };
  const counts = (calls: Record<string, ReturnType<typeof vi.fn>>) => Object.fromEntries(Object.entries(calls).map(([id, spy]) => [id, spy.mock.calls.length]));

  it('rail: no callback on the initial render', () => {
    const { calls, sections } = spies();
    render(shell({ form: 'rail', sections }));
    expect(counts(calls)).toEqual({ target: 0, legend: 0, options: 0 });
  });

  it('rail: a tooltip opening and closing calls no callback', async () => {
    const { calls, sections } = spies();
    render(shell({ form: 'rail', sections }));
    header('범례').focus();
    await screen.findByRole('tooltip');
    header('범례').blur();
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(counts(calls)).toEqual({ target: 0, legend: 0, options: 0 });
  });

  it('rail: opening and closing a peek calls only that section\'s callback', async () => {
    const { calls, sections } = spies();
    render(shell({ form: 'rail', sections }));
    const button = header('범례');
    fireEvent.click(button);
    const content = await screen.findByText('content legend');
    expect(calls.legend).toHaveBeenCalled();
    expect(calls.target).not.toHaveBeenCalled();
    expect(calls.options).not.toHaveBeenCalled();
    fireEvent.keyDown(content, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('content legend')).toBeNull());
    expect(calls.target).not.toHaveBeenCalled();
    expect(calls.options).not.toHaveBeenCalled();
  });

  it('rail: a sibling peek and a sibling tooltip never call the closed sections', async () => {
    const { calls, sections } = spies();
    render(shell({ form: 'rail', sections }));
    fireEvent.click(header('범례'));
    await screen.findByText('content legend');
    header('옵션').focus();
    await screen.findByRole('tooltip');
    fireEvent.pointerDown(header('옵션'));
    fireEvent.click(header('옵션'));
    await screen.findByText('content options');
    await waitFor(() => expect(screen.queryByText('content legend')).toBeNull());
    expect(calls.target).not.toHaveBeenCalled();
  });
});
