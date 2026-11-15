import { lazy } from 'react';
import { groupId, menuPermission } from '@ap/contracts';
import type { EquipmentAxisDescriptor, QueryHistoryStore } from '@ap/contracts';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import type { CreateRegistryInput } from './build-registry';
import type { HostAssembly } from './types';

type Menu = CreateRegistryInput['menus'][number];
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const icon = (() => null) as unknown as Menu['icon'];

/** One minimal menu with a visible body; `over` replaces any field the test means. */
export function testMenu(id: string, over: Partial<Menu> = {}): Menu {
  const Body = () => <p>{`menu ${id}`}</p>;
  return { id, group: groupId('work'), path: `/${id}`, permission: 'platform:view', primary: true, label: { ko: id, en: id }, description: { ko: '', en: '' }, icon, requiresScope: false, context: noContext, pageType: 'overview', features: noFeatures, pageKeys: [], component: lazy(async () => ({ default: Body })), ...over } as Menu;
}

/** The smallest valid declaration set: one space, one group, one menu. */
export function testDeclarations(over: Partial<CreateRegistryInput> = {}): CreateRegistryInput {
  return {
    spaces: [testSpace({ homeMenuId: 'first' })],
    groups: [{ id: groupId('work'), label: { ko: '업무', en: 'Work' }, icon, space: testSpace().id }],
    menus: [testMenu('first')],
    permissions: [menuPermission('equipment:view')],
    ...over,
  };
}

// One session object: the Provider disposes its focus gate when the session identity changes, so a fresh one per call would loop.
const session = testSession(['platform:view']);
export const testAssembly = (over: Partial<HostAssembly> = {}): HostAssembly => ({ adapter: testAdapter({ session: () => session }), topBarTools: null, ...over });
export const AXES: readonly EquipmentAxisDescriptor[] = [];
export const QUERY_HISTORY: QueryHistoryStore = { list: async () => [], record: async () => {}, remove: async () => {}, clear: async () => {} };
