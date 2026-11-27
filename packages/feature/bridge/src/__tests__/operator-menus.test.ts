import { describe, expect, it } from 'vitest';
import type { MenuEntry } from '@ap/kernel';
import { listScopeCapability, usesListScope } from '../operator-menus';

const menu = (group: string, pageKeys: readonly string[] = ['managedSystem']) => ({ group, pageKeys }) as unknown as MenuEntry;

describe('listScopeCapability (#2630, #2632)', () => {
  it('mounts and reads the declared capability for a menu in a new group', () => {
    const declared = { ...menu('new-operator-group'), requiredCapability: { id: 'survey.read' } };
    expect(listScopeCapability(declared)).toBe('survey.read');
    expect(usesListScope(declared)).toBe(true);
  });

  it('keeps page-owned scope off the sidebar while reading its capability', () => {
    const declared = { ...menu('myActivity'), requiredCapability: { id: 'finding.manage', scopePicker: 'page' as const } };
    expect(usesListScope(declared)).toBe(false);
    expect(listScopeCapability(declared)).toBe('finding.manage');
  });

  it.each(['voc', 'dashboard', 'integration', 'flowSettings'])('keeps the picker default for %s', group => {
    expect(listScopeCapability(menu(group))).toBeUndefined();
  });

  it('declares nothing for a menu without the list scope', () => {
    expect(listScopeCapability({ ...menu('findings', []), requiredCapability: { id: 'finding.read' } })).toBeUndefined();
    expect(listScopeCapability(null)).toBeUndefined();
  });
});
