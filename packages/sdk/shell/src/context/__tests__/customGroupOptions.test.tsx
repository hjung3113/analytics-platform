import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { createFakeSavedViewStore, noContext, testAdapter, testSavedView, testSession, testSpace } from '@ap/kernel/testing';
import { useCustomGroupOptions } from '../customGroupOptions';

const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: { ...noContext, condition: 'apply' }, pageKeys: [], pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false } }] });

it('ignores a save that settles after the Scope moved on, so the new Scope keeps its groups and blockers (#2390)', async () => {
  const store = createFakeSavedViewStore([testSavedView({ id: 'b-1', kind: 'custom-group', savedScopeId: 'B', target: { fixed: ['E1'] } })]);
  const session = testSession(['platform:view']);
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session })}>{children}</PlatformProvider></I18nProvider>;
  const { result, rerender } = renderHook(({ scopeId }) => useCustomGroupOptions({ scopeId, selectedGroupIds: ['b-1', 'gone-9'], canEditCondition: true }), { wrapper, initialProps: { scopeId: 'A' } });
  await waitFor(() => expect(result.current.optionsById.get('gone-9')?.reason).toBe('not-found'));
  const rememberInA = result.current.remember;
  rerender({ scopeId: 'B' });
  await waitFor(() => expect(result.current.optionsById.get('b-1')?.target).toEqual({ fixed: ['E1'] }));
  const late = await store.save({ schemaVersion: 1, kind: 'custom-group', name: 'late', savedScopeId: 'A', target: { fixed: ['E2'] } });
  if (!late.ok) throw new Error('save failed');
  act(() => rememberInA(late.value));
  expect(result.current.optionsById.get('b-1')?.target).toEqual({ fixed: ['E1'] });
  expect(result.current.blocked).toEqual([{ id: 'gone-9', reason: '없는 그룹' }]);
});
