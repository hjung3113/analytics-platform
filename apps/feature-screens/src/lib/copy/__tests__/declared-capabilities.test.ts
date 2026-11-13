// ADR-0157 decision 9: declared capability rows on the screens — display name with its id, the id alone until the server
// read is loaded or when the bundle no longer declares it, and one group after the platform categories. Synthetic names.

import type { DeclaredCapabilityItem } from '@ap/feature-shared';
import { describe, expect, it } from 'vitest';

import { getCapabilityDisplayLabel } from '../capabilities.js';
import { DECLARED_PERMISSION_CATEGORY, declaredSelectionItem, groupPermissionItems, permissionSelectionItem } from '../permission-selection.js';

const declared: DeclaredCapabilityItem[] = [
  { id: 'ext.widget.annotate', display_name: 'Widget annotate', sensitive: true, requestable: false },
  { id: 'ext.widget.view', display_name: 'ext.widget.view', sensitive: false, requestable: true },
];

describe('declared capability labels', () => {
  it('shows the display name with the id beside it', () => {
    expect(getCapabilityDisplayLabel('ext.widget.annotate', declared)).toBe('Widget annotate (ext.widget.annotate)');
  });

  it('shows the id alone when the display name is the id, the read is not loaded or the name is no longer declared', () => {
    expect(getCapabilityDisplayLabel('ext.widget.view', declared)).toBe('ext.widget.view');
    expect(getCapabilityDisplayLabel('ext.widget.annotate')).toBe('ext.widget.annotate');
    expect(getCapabilityDisplayLabel('ext.widget.gone', declared)).toBe('ext.widget.gone');
  });

  it('keeps the platform labels and the safe label for other unknown keys', () => {
    expect(getCapabilityDisplayLabel('workspace.read', declared)).toBe('전체 읽기');
    expect(getCapabilityDisplayLabel('future.capability', declared)).toBe('권한 요청');
  });
});

describe('declared capability selection rows', () => {
  it('marks a declared capability sensitive unless the server read says otherwise', () => {
    expect(declaredSelectionItem('ext.widget.annotate', declared).badge).toEqual({ label: '민감', tone: 'warning' });
    expect(declaredSelectionItem('ext.widget.view', declared).badge).toBeUndefined();
    expect(declaredSelectionItem('ext.widget.unloaded', []).badge).toEqual({ label: '민감', tone: 'warning' });
    expect(declaredSelectionItem('ext.widget.annotate', declared).description).toBe('ext.widget.annotate');
  });

  it('groups declared rows after the platform categories', () => {
    const groups = groupPermissionItems([
      { ...declaredSelectionItem('ext.widget.annotate', declared), capability: 'ext.widget.annotate' },
      { ...permissionSelectionItem('workspace.read'), capability: 'workspace.read' },
    ]);
    expect(groups.map((group) => group.id)).toEqual(['공통', DECLARED_PERMISSION_CATEGORY]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(['ext.widget.annotate']);
  });
});
