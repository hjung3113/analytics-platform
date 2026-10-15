import { afterEach, describe, expect, it } from 'vitest';
import type { Capability, ContextKey, MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole, USERS, type RoleId } from '@ap/mock-server';
import { homeMock } from './index';
import { noticesEndpoint, type Notice } from '../endpoints';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
const base = { description: { ko: '', en: '' }, requiresScope: false, context: none, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] };
/** Inline mirrors of the home manifest and the notice menu that declares `notice:view` (registration checks the name exists). */
const homeMenu: MenuMeta = { ...base, id: 'home', group: 'overview', label: { ko: '운영 개요', en: 'Operations overview' }, path: '/', permission: 'platform:view', pageType: 'overview' };
const noticeMenu: MenuMeta = { ...base, id: 'notices', group: 'noticeVoc', label: { ko: '공지', en: 'Notices' }, path: '/notices', permission: 'notice:view', pageType: 'management' };

const adapter = createMockAdapter({ endpoints: [...homeMock], registry: { menus: [homeMenu, noticeMenu] } });
const previousRole: RoleId = getRole();
afterEach(() => { setRole(previousRole); });

describe('home notices endpoint', () => {
  it('answers notices for the targeted site only', async () => {
    setRole('viewer');
    const response = await adapter.menuQuery({ endpoint: noticesEndpoint.id, context: {}, params: { targetScopeId: 'CJU' } });
    expect(response.outcome).toBe('ok');
    expect((response.data as Notice[]).map(n => n.id)).toEqual(['N-2026-088']);
    const none = await adapter.menuQuery({ endpoint: noticesEndpoint.id, context: {}, params: { targetScopeId: null } });
    expect(none.outcome).toBe('empty');
  });

  it('checks the endpoint permission notice:view, not the home menu permission platform:view', async () => {
    const permissions = [...USERS.viewer.permissions];
    USERS.viewer.permissions = permissions.filter(p => p !== 'notice:view');
    try {
      setRole('viewer');
      expect(USERS.viewer.permissions).toContain('platform:view');
      const response = await adapter.menuQuery({ endpoint: noticesEndpoint.id, context: {}, params: { targetScopeId: 'ICH' } });
      expect(response.outcome).toBe('forbidden');
    } finally {
      USERS.viewer.permissions = permissions;
    }
  });

  it('rejects a Scope sent as Context: home does not apply Scope', async () => {
    const response = await adapter.menuQuery({ endpoint: noticesEndpoint.id, context: { scopeId: 'ICH' }, params: { targetScopeId: 'ICH' } });
    expect(response.outcome).toBe('error');
  });
});
