import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn } from '../PlatformDataTable';

// #2813: scrolling re-renders the virtual rows only. `collapsedControls` runs once per render of the table around them (toolbar,
// header, pager), so its call count is that render count.
const toolbarRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('../tableToolbar', async original => {
  const actual = await original<typeof import('../tableToolbar')>();
  return { ...actual, collapsedControls: (...args: Parameters<typeof actual.collapsedControls>) => { toolbarRenders.count++; return actual.collapsedControls(...args); } };
});

type Row = { id: string; name: string; value: number };
const ROWS: Row[] = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, name: `row ${i}`, value: i * 3 }));
const columns: PlatformColumn<Row>[] = [{ id: 'name', header: 'Name' }, { id: 'value', header: 'Value', align: 'right' }];
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });

// jsdom has no layout: the shared compact geometry makes every box, rows included, 800px, so the virtualizer mounts a small window.
const ROW_HEIGHT = 800;
let restore: (() => void) | undefined;
beforeEach(() => { restore = stubCompactTableGeometry(800); });
afterEach(() => { cleanup(); restore?.(); });

const mountTable = () => render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
  <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} rows={ROWS} preferenceKey="scroll-render" pageSize={300} height={420} />
</PlatformProvider></I18nProvider>);

const bodyRows = () => [...document.querySelectorAll<HTMLElement>('[role="rowgroup"] > [role="row"][data-row-id]')];
const scrollTo = async (top: number) => {
  const port = screen.getByRole('table', { name: 'table' }).querySelector<HTMLElement>('[tabindex="0"].overflow-auto') ?? document.querySelector<HTMLElement>('.overflow-auto')!;
  await act(async () => { port.scrollTop = top; fireEvent.scroll(port); });
};

describe('PlatformDataTable scroll (#2813)', () => {
  it('mounts the next rows on a one-row scroll without re-rendering the toolbar', async () => {
    mountTable();
    await screen.findByText('row 0');
    const before = toolbarRenders.count;
    const firstRows = bodyRows().map(row => row.dataset.rowId);
    for (let step = 1; step <= 20; step++) await scrollTo(step * ROW_HEIGHT);
    expect(toolbarRenders.count).toBe(before);
    const scrolledRows = bodyRows().map(row => row.dataset.rowId);
    expect(scrolledRows).not.toEqual(firstRows);
    expect(scrolledRows).toContain(`r${firstRows.length + 10}`);
  });

  it('renders the scrolled window as before', async () => {
    mountTable();
    await screen.findByText('row 0');
    await scrollTo(40 * ROW_HEIGHT);
    expect(bodyRows().map(row => row.outerHTML).join('\n')).toMatchSnapshot();
  });
});
