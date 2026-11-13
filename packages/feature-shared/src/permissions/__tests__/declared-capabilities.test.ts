// ADR-0157 wire vocabulary: a capability name on the wire is a platform capability or a declared-prefix name (whether the
// server declares it is the server's judgment). Synthetic names only.

import { describe, expect, it } from 'vitest';

import {
  capabilityNameSchema,
  declaredCapabilityItemSchema,
  directPermissionGrantSchema,
  permissionGrantedDetailSchema,
} from '../../index.js';

describe('capability names on the wire (ADR-0157)', () => {
  it.each(['workspace.read', 'ext.widget.annotate', 'ext.widget.sub_view'])('accepts %s', (name) => {
    expect(capabilityNameSchema.safeParse(name).success).toBe(true);
  });

  it.each(['widget.annotate', 'ext.widget', 'ext.Widget.view', 'future.capability'])(
    'refuses %s with the closed enum issue code',
    (name) => {
      const parsed = capabilityNameSchema.safeParse(name);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.code).toBe('invalid_enum_value');
    },
  );

  it('a direct grant and its audit detail carry a declared name', () => {
    expect(
      directPermissionGrantSchema.safeParse({
        actor_id: '00000000-0000-4000-8000-000000000001',
        capability: 'ext.widget.annotate',
        reason: 'needed',
      }).success,
    ).toBe(true);
    expect(
      permissionGrantedDetailSchema.safeParse({
        grant_id: '00000000-0000-4000-8000-000000000002',
        grantee_actor_id: '00000000-0000-4000-8000-000000000001',
        capability: 'ext.widget.annotate',
        managed_system_id: null,
        reason: 'needed',
        expires_at: null,
        mode: 'create',
      }).success,
    ).toBe(true);
  });

  it('the declared capability read keeps the id grammar and the display-name cap', () => {
    const item = { id: 'ext.widget.annotate', display_name: 'Annotate', sensitive: true, requestable: false };
    expect(declaredCapabilityItemSchema.safeParse(item).success).toBe(true);
    expect(declaredCapabilityItemSchema.safeParse({ ...item, id: 'workspace.read' }).success).toBe(false);
    expect(declaredCapabilityItemSchema.safeParse({ ...item, display_name: 'x'.repeat(81) }).success).toBe(false);
  });
});
