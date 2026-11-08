import { cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformMenuEntry } from '@ap/kernel';
import { noContext, testAdapter, testSpace } from '@ap/kernel/testing';
import { PlatformDataTable } from '../../table/PlatformDataTable';
import { PlatformPage } from '../PlatformPage';

afterEach(cleanup);
const features = { export: false, savedView: false, annotate: false, compare: false };
const home: PlatformMenuEntry = { id: 'home', path: '/', primary: true, group: groupId('overview'), label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [] };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [home] });
const loadPage = async () => ({ outcome: 'ok' as const, data: { rows: [{ id: 'one' }], total: 1 }, assessments: [], trust: null, correlationId: 'test' });
const table = (fill: boolean) => <PlatformDataTable title="표" ariaLabel="원본" fill={fill} columns={[{ id: 'id', header: '순번' }]} getRowId={r => r.id} loadPage={loadPage} preferenceKey="fill-bound" />;
const mount = (fill: boolean) => render(<I18nProvider><PlatformProvider adapter={testAdapter()} registry={registry}><PlatformPage layout="fill">{table(fill)}</PlatformPage></PlatformProvider></I18nProvider>);

describe('PlatformPage fill body is bounded only while a fill table shows (#1473)', () => {
  it('bounds the body to the container with a fill table', () => {
    const { container } = mount(true);
    expect(container.querySelector('[data-platform-page-content]')?.className).toContain('min-h-0');
  });
  it('keeps the page sizing unchanged without one', () => {
    const { container } = mount(false);
    expect(container.querySelector('[data-platform-page-content]')?.className).not.toContain('min-h-0');
  });
});
