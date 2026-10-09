import { describe, expect, it } from 'vitest';
import { House } from 'lucide-react';
import type { UsageMenuSummary } from '@ap/contracts';
import { createRegistry, type MenuEntry } from '@ap/kernel';
import { joinUsageRows, formatLastUsed } from './usage-rows';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const menu = (over: Partial<MenuEntry>): MenuEntry => ({
  id: 'x', group: 'admin', label: { ko: '기본', en: 'Default' }, description: { ko: '', en: '' }, path: '/x', icon: House,
  permission: 'platform:view', requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [], ...over,
});

const registry = createRegistry({
  spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' }],
  menus: [
    menu({ id: 'admin-roles', primary: true, label: { ko: '권한/역할 관리', en: 'Roles & access' }, path: '/admin/roles', permission: 'console:access' }),
    menu({ id: 'admin-usage', label: { ko: '메뉴 활용률', en: 'Menu usage' }, path: '/admin/usage', permission: 'console:access' }),
  ],
});

const summary: UsageMenuSummary[] = [{ menuId: 'admin-roles', visits: 7, distinctUsers: 2, lastUsedAt: 1_760_000_000_000 }];

describe('joinUsageRows', () => {
  it('keeps registry order, carries summary numbers and zero-fills missing menus', () => {
    expect(joinUsageRows(registry, summary)).toEqual([
      { id: 'admin-roles', label: { ko: '권한/역할 관리', en: 'Roles & access' }, spaceId: 'operations', spaceLabel: { ko: 'operations', en: 'operations' }, visits: 7, distinctUsers: 2, lastUsedAt: 1_760_000_000_000 },
      { id: 'admin-usage', label: { ko: '메뉴 활용률', en: 'Menu usage' }, spaceId: 'operations', spaceLabel: { ko: 'operations', en: 'operations' }, visits: 0, distinctUsers: 0, lastUsedAt: null },
    ]);
  });

  it('labels a global utility menu 전역', () => {
    const globalRegistry = createRegistry({
      spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
      groups: [
        { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
        { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: House, space: null },
      ],
      menus: [
        menu({ id: 'admin-roles', primary: true, path: '/admin/roles', permission: 'console:access' }),
        menu({ id: 'notices', group: 'noticeVoc', primary: true, label: { ko: '공지', en: 'Notices' }, path: '/notices', permission: 'notice:view' }),
      ],
    });
    expect(joinUsageRows(globalRegistry, []).find(row => row.id === 'notices')).toMatchObject({
      spaceId: null, spaceLabel: { ko: '전역', en: 'Global' },
    });
  });

  it('renders a successful zero when the summary is empty', () => {
    expect(joinUsageRows(registry, [])).toEqual([
      { id: 'admin-roles', label: { ko: '권한/역할 관리', en: 'Roles & access' }, spaceId: 'operations', spaceLabel: { ko: 'operations', en: 'operations' }, visits: 0, distinctUsers: 0, lastUsedAt: null },
      { id: 'admin-usage', label: { ko: '메뉴 활용률', en: 'Menu usage' }, spaceId: 'operations', spaceLabel: { ko: 'operations', en: 'operations' }, visits: 0, distinctUsers: 0, lastUsedAt: null },
    ]);
  });
});

// Regression (#88): lastUsedAt is an epoch-ms instant — formatDateTime printed the UTC digits as local.
describe('formatLastUsed', () => {
  it('renders the instant in the viewer time zone, not the UTC digits', () => {
    expect(formatLastUsed(1_790_560_800_000, 'en', 'Asia/Seoul')).toContain('11:00');
    expect(formatLastUsed(1_790_560_800_000, 'en', 'Asia/Seoul')).not.toContain('02:00');
  });
  it('renders an em dash for a menu never used', () => {
    expect(formatLastUsed(null, 'en', 'Asia/Seoul')).toBe('—');
  });
});
