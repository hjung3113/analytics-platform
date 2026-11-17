import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable } from '../PlatformDataTable';
import { columnGroupBasis, type StoredColumnGroups } from '../columnGroups';
import { downloadBlob } from '../download';
vi.mock('../download', async original => ({ ...await original<typeof import('../download')>(), downloadBlob: vi.fn() }));
const columns = [{ id: 'a', header: 'A', columnGroup: ['D', 'X'] }, { id: 'b', header: 'B', columnGroup: ['D', 'X'] }, { id: 'c', header: 'C' }];
const labels = { D: 'Declared', X: 'Nested' };
const registry = createRegistry({ spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'export-user' } });
const adapter = testAdapter({ session: () => session });
const rows = [{ id: 'row', a: 1, b: 2, c: 3 }];
const exportRows = vi.fn(async () => ({ outcome: 'ok' as const, data: rows, assessments: [], trust: null, correlationId: 'test' }));
let restore: () => void;
beforeEach(() => { restore = stubCompactTableGeometry(1100); vi.stubGlobal('localStorage', memoryStorage()); vi.clearAllMocks(); });
afterEach(() => { cleanup(); restore(); vi.unstubAllGlobals(); });
const textOf = (blob: Blob) => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
describe('editable groups export uses the screen model', () => {
  it.each([
    { name: 'mixed depth', items: [{ id: 'D', label: 'Changed', members: ['a', 'b', 'c'] }], basis: 'current', expected: 'Changed › Nested › A,Changed › Nested › B,Changed › C', group: 'Changed' },
    { name: 'merge error', items: [{ id: 'D', members: ['a'] }, { id: 'X', label: 'Bad', members: ['c'] }], basis: 'current', expected: 'Declared › Nested › A,Declared › Nested › B,C', group: 'Declared' },
    { name: 'basis drift', items: [], basis: 'stale', expected: 'Declared › Nested › A,Declared › Nested › B,C', group: 'Declared' },
  ])('$name uses the same group headers in screen and CSV', async ({ items, basis, expected, group }) => {
    const groups: StoredColumnGroups = { basis: basis === 'current' ? columnGroupBasis(columns, labels) : basis, items };
    localStorage.setItem('platform:columns:v1:export-user:export', JSON.stringify({ groups }));
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <PlatformDataTable editableColumnGroups title="T" ariaLabel="export" rows={rows} columns={columns} columnGroups={labels} getRowId={r => r.id} preferenceKey="export" exportRows={exportRows} />
    </PlatformProvider></I18nProvider>);
    const groupHeader = await screen.findByRole('columnheader', { name: group });
    expect(groupHeader).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '내보내기' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /CSV/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    const blob = vi.mocked(downloadBlob).mock.calls[0][0];
    expect((await textOf(blob)).replace(/^\uFEFF/, '').split(/\r?\n/)[0]).toBe(expected);
  });
});
