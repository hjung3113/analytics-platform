import { describe, expect, it } from 'vitest';
import { groupId, spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';
import { explorerEndpoints, explorerActions } from './endpoints';

describe('confirmed log explorer registry (#1473)', () => {
  it('registers exactly the explorer and its hidden investigation view', () => {
    const menu = manifests[0];
    const spaces: SpaceDef[] = [{ id: spaceId('log-dev'), label: { ko: '표준 로그 개발', en: 'Logs' }, description: { ko: '조사', en: 'Investigations' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: groupId('logAnalysis'), label: { ko: '로그 분석', en: 'Analysis' }, icon: menu.icon, space: spaceId('log-dev') }];
    const registry = createRegistry({ spaces, groups, menus: manifests });
    expect(manifests.map(m => m.id)).toEqual(['log-explorer', 'log-explorer-view']);
    expect(registry.menuById('log-explorer').aliases).toContain('/log/explorer');
    expect(registry.matchRoute('/log/explorer')?.menu.id).toBe('log-explorer');
    expect(registry.menuById('log-explorer-view')).toMatchObject({ navHidden: true, aliases: ['/log/explorer/:investigationId'], parent: 'log-explorer' });
  });
  it('declares only merged reads/actions under their corrected owning menu', () => {
    expect(explorerEndpoints.map(e => e.id)).toEqual(['logExplorer.investigations', 'logExplorer.investigationDetail', 'logExplorer.records', 'logExplorer.window', 'logExplorer.parsed', 'logExplorer.periods']);
    expect(explorerActions).toHaveLength(5);
    expect([...explorerEndpoints, ...explorerActions].every(e => e.menuId === 'log-explorer')).toBe(true);
    expect(explorerActions.some(a => a.id.includes('Handoff'))).toBe(false);
  });
});
