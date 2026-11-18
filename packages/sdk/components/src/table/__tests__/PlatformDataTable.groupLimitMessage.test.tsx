// #2514 Q4: the limit message takes the caps from @ap/contracts, not from its own copy. A mocked group cap must show up
// in the message, while the saved-view guard (module-internal constants) still refuses the oversized snapshot.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, testAdapter, testMenu, testSession, testSpace, ToastProbe } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn } from '../PlatformDataTable';

vi.mock('@ap/contracts', async importOriginal => ({ ...await importOriginal<typeof import('@ap/contracts')>(), MAX_COLUMN_GROUPS: 7 }));

type Row = { id: string };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [testMenu()] });
const session = testSession(['platform:view'], { user: { id: 'group-user' } });
const adapter = testAdapter({ session: () => session });
// 20 declared members with 1,000-character ids push the declaration fingerprint past 16,384, so any new group is refused.
// Few columns keep the render cheap; a declared id over 200 characters only makes that column unavailable to the editor.
const columns: PlatformColumn<Row>[] = [{ id: 'free', header: '자유' }, { id: 'other', header: '다른' }, ...Array.from({ length: 20 }, (_, i) => ({ id: `${'w'.repeat(996)}${String(i).padStart(4, '0')}`, header: `넓은 ${i}`, columnGroup: ['developer'] }))];
let restore: () => void;
beforeEach(() => { restore = stubCompactTableGeometry(1100); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('PointerEvent', MouseEvent); });
afterEach(() => { cleanup(); restore(); vi.unstubAllGlobals(); });

it('a refused save explains the limits with the contracts constants (#2514 Q4)', async () => {
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformDataTable editableColumnGroups title="T" ariaLabel="limit" columns={columns} columnGroups={{ developer: '개발자 묶음' }} rows={[{ id: 'row' }]} getRowId={r => r.id} preferenceKey="limit" height={300} rowAction={() => <button>ready</button>} />
    <ToastProbe />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('button', { name: 'ready' });
  await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
  await userEvent.click(screen.getByRole('button', { name: '묶음 만들기' }));
  await userEvent.click(screen.getByRole('checkbox', { name: '자유 선택' }));
  await userEvent.click(screen.getByRole('checkbox', { name: '다른 선택' }));
  await userEvent.type(screen.getByRole('textbox', { name: '묶음 이름' }), '비교');
  await userEvent.click(screen.getByRole('button', { name: '묶기' }));
  expect((await screen.findAllByText('열 묶음은 7개, 묶음당 열은 500개까지 저장할 수 있습니다. 열과 묶음 ID는 200자, 선언 정보는 16,384자 이내여야 합니다.')).length).toBeGreaterThan(0);
}, 15_000);
