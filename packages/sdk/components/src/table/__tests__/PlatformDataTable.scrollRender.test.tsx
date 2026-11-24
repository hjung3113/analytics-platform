import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn, type PlatformDataTableProps } from '../PlatformDataTable';

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
  const port = document.querySelector<HTMLElement>('.scrollbar-panel.overflow-auto')!;
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

  it('focuses a keyboard target beyond the mounted rows once it mounts, in a grid without a pinned row (review)', async () => {
    // jsdom has no scrolling: the virtualizer's scrollTo moves scrollTop and fires the scroll it would cause.
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options?: ScrollToOptions) {
      if (options?.top !== undefined) { this.scrollTop = options.top; this.dispatchEvent(new Event('scroll')); }
    } });
    type Cell = NonNullable<PlatformDataTableProps<Row>['selectedCell']>;
    function Grid() {
      const [cell, setCell] = useState<Cell>({ row: 'r0', column: 'value' });
      return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
        <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} rows={ROWS} preferenceKey="scroll-grid" pageSize={300} height={420}
          selectedCell={cell} onSelectCell={setCell} />
      </PlatformProvider></I18nProvider>;
    }
    render(<Grid />);
    await screen.findByText('row 0');
    const first = document.querySelector<HTMLElement>('[data-row-id="r0"] [data-column="value"]')!;
    first.focus();
    await act(async () => { fireEvent.keyDown(first, { key: 'End', ctrlKey: true }); });
    // jsdom clamps the virtualizer's own scroll to zero height, so the scroll that mounts the target comes from here.
    await scrollTo(299 * ROW_HEIGHT);
    const last = document.querySelector<HTMLElement>('[data-row-id="r299"] [data-column="value"]');
    expect(last).not.toBeNull();
    expect(document.activeElement).toBe(last);
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  });
});
