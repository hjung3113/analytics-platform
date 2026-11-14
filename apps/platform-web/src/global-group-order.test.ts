import { describe, expect, it } from 'vitest';
import { MENUS, placeGlobalGroups } from './menus';

describe('global menu group placement (#2037 MEN-23)', () => {
  it('counts the insertion position after removing every listed group member', () => {
    const find = (id: string) => MENUS.find(menu => menu.id === id)!;
    const ids = ['api-tokens', 'equipment-master', 'notifications', 'my-tasks', 'permission-requests', 'notices', 'faq', 'voc', 'voc-detail', 'surveys', 'survey-respond'];
    const result = placeGlobalGroups(ids.map(find));
    expect(result.map(menu => menu.id)).toEqual(['equipment-master', 'notifications', 'my-tasks', 'permission-requests', 'api-tokens', 'notices', 'faq', 'voc', 'voc-detail', 'surveys', 'survey-respond']);
  });
});
