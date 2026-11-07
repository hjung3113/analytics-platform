import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { House } from 'lucide-react';
import { groupId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { noContext, testAdapter, testSpace } from '@ap/kernel/testing';
import { PlatformDataTable } from '../PlatformDataTable';

afterEach(cleanup);
const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'fill' })], groups: [{ id: groupId('fill'), label: { ko: '표', en: 'Table' }, icon: House, space: testSpace().id }], menus: [{ id: 'fill', primary: true, group: groupId('fill'), label: { ko: '표', en: 'Table' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }] });
const loadPage = async () => ({ outcome: 'ok' as const, data: { rows: [{ id: 'one' }], total: 1 }, assessments: [], trust: null, correlationId: 'test' });
function mount(fill?: boolean, height?: number) {
  return render(<I18nProvider><PlatformProvider adapter={testAdapter()} registry={registry}><PlatformDataTable title="표" ariaLabel="원본" columns={[{ id: 'id', header: '순번' }]} getRowId={r => r.id} loadPage={loadPage} preferenceKey="flex-fill" fill={fill} height={height} /></PlatformProvider></I18nProvider>);
}
describe('optional table fill (#1473)', () => {
  it.each([undefined, false])('keeps the default fit cap for fill=%s', async fill => {
    mount(fill);
    const viewport = screen.getByLabelText('스크롤 가능한 행 영역');
    expect(viewport.style.maxHeight).not.toBe('');
    expect(viewport).toHaveAttribute('data-table-auto-fit');
    expect(screen.getByRole('region', { name: '원본' }).className).not.toContain('max-h-full');
  });
  it('uses the parent height budget without a measured cap or a fixed empty area for a single row', async () => {
    mount(true);
    await screen.findByRole('table', { name: '원본' });
    const viewport = screen.getByLabelText('스크롤 가능한 행 영역');
    expect(viewport.style.maxHeight).toBe('');
    expect(viewport.style.height).toBe('');
    expect(viewport).not.toHaveAttribute('data-table-auto-fit');
    expect(viewport.className).toContain('min-h-0');
    expect(screen.getByRole('region', { name: '원본' }).className).toContain('max-h-full');
  });
  it('keeps an explicit height as the row-area cap when fill is opted in', () => {
    mount(true, 180);
    expect(screen.getByLabelText('스크롤 가능한 행 영역').style.maxHeight).toBe('180px');
  });
});
