import { describe, expect, it } from 'vitest';
import type { MenuEntry } from '@ap/kernel';
import { listScopeCapability } from './operator-menus';

const menu = (group: string, pageKeys: readonly string[] = ['managedSystem']) => ({ group, pageKeys }) as unknown as MenuEntry;

describe('listScopeCapability (#2630, #2632)', () => {
  it.each([['findings', 'finding.read'], ['surveys', 'survey.read'], ['tasks', 'finding.manage']])('marks the %s group by %s', (group, capability) => {
    expect(listScopeCapability(menu(group))).toBe(capability);
  });

  it.each(['voc', 'dashboard', 'integration', 'flowSettings'])('keeps the picker default for %s', group => {
    expect(listScopeCapability(menu(group))).toBeUndefined();
  });

  it('declares nothing for a menu without the list scope', () => {
    expect(listScopeCapability(menu('findings', []))).toBeUndefined();
    expect(listScopeCapability(null)).toBeUndefined();
  });
});
