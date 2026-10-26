import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, usePlatform, type HomeTodoSlot, type PlatformSlots } from '../platform';
import { createRegistry } from '../../registry/registry';
import { noContext, testAdapter, testSession, testSpace } from '../../testing';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [testSpace({ homeMenuId: 'source' })],
  groups: [{ id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: spaceId('analytics') }],
  menus: [{
    id: 'source', group: groupId('equipment'), label: { ko: 'source', en: 'source' }, description: { ko: '', en: '' }, path: '/source', icon: House, permission: 'platform:view',
    requiresScope: false, context: noContext, pageType: 'analysis' as const, features: noFeatures, pageKeys: [], primary: true,
  }],
});

let seen: ReturnType<typeof usePlatform>['homeTodo'] | undefined;
function Probe() {
  seen = usePlatform().homeTodo;
  return <p data-testid="ready">ready</p>;
}
function mount(slots?: PlatformSlots) {
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}><Probe /></PlatformProvider></I18nProvider>);
  screen.getByTestId('ready');
}

afterEach(() => { cleanup(); seen = undefined; });

describe('MenuPlatform.homeTodo (ADR-0070 decision 8, ADR-0076)', () => {
  it('is the slot the app gave', () => {
    const slot: HomeTodoSlot = { Todo: () => null };
    mount({ homeTodo: slot });
    expect(seen).toBe(slot);
  });

  it('is null when the app gave none', () => {
    mount();
    expect(seen).toBeNull();
  });
});
