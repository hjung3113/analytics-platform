import { describe, expect, it } from 'vitest';
import type { MenuEntry } from '@ap/kernel';
import { listScopeCapability } from './operator-menus';

const menu = (group: string, pageKeys: readonly string[] = ['managedSystem']) => ({ group, pageKeys }) as unknown as MenuEntry;

describe('listScopeCapability (#2630)', () => {
  it('marks the findings group (전체 Finding, 근거) by finding.read', () => {
    expect(listScopeCapability(menu('findings'))).toBe('finding.read');
  });

  it.each(['voc', 'tasks', 'surveys', 'dashboard', 'integration', 'flowSettings'])('keeps the picker default for %s', group => {
    expect(listScopeCapability(menu(group))).toBeUndefined();
  });

  it('declares nothing for a menu without the list scope', () => {
    expect(listScopeCapability(menu('findings', []))).toBeUndefined();
    expect(listScopeCapability(null)).toBeUndefined();
  });
});
