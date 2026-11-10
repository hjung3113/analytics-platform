import { describe, expect, it } from 'vitest';

import type { Db } from '../../../db/client.js';
import { createMenuDispatchRegistry } from '../../menu-dispatch/registry.js';
import type { CheckService } from '../../permissions/check-service.js';
import { eqvContribution } from '../index.js';
import { EQV_FOCUS_MENU_ID, EQV_STUDIO_MENU_ID } from '../menu.js';

const contribution = eqvContribution({ db: {} as Db, checkService: {} as CheckService });

describe('eqv declarations (#1645)', () => {
  it('registers at startup (no requiresScope, no mergeTimeDomain, invalidates stay on the same menu)', () => {
    expect(() => createMenuDispatchRegistry([contribution])).not.toThrow();
  });

  it('declares exactly the reads and writes of the issue, none of step 9', () => {
    const registry = createMenuDispatchRegistry([contribution]);
    expect([...registry.endpointIds].sort()).toEqual(
      ['eqv.equipment-options', 'eqv.layoutDraft', 'eqv.layoutRevision', 'eqv.layoutRevisions', 'eqv.layouts', 'eqv.template', 'eqv.templates'].sort(),
    );
    expect([...registry.actionIds].sort()).toEqual(['eqv.promoteTemplate', 'eqv.publishRevision', 'eqv.saveDraft']);
    expect(registry.endpointIds).not.toContain('eqv.topview-context');
    expect(registry.endpointIds).not.toContain('eqv.topview-events');
  });

  it('puts every read except the equipment options, and every action, on the studio menu', () => {
    for (const { spec } of contribution.endpoints ?? []) {
      expect(spec.menuId, spec.id).toBe(spec.id === 'eqv.equipment-options' ? EQV_FOCUS_MENU_ID : EQV_STUDIO_MENU_ID);
      expect(spec.permission).toBe('eqv:view');
      expect(spec.requiresScope).toBe(false);
      expect(spec.mergeTimeDomain).toBe(false);
      expect(spec.context).toEqual({});
    }
    for (const { spec } of contribution.actions ?? []) expect(spec.menuId, spec.id).toBe(EQV_STUDIO_MENU_ID);
  });

  it('uses version concurrency for saveDraft and publishRevision only, with the capability permissions', () => {
    const byId = new Map((contribution.actions ?? []).map((a) => [a.spec.id, a.spec]));
    expect(byId.get('eqv.saveDraft')).toMatchObject({ concurrency: 'version', permission: 'eqv-studio:layout-edit' });
    expect(byId.get('eqv.publishRevision')).toMatchObject({ concurrency: 'version', permission: 'eqv-studio:layout-publish' });
    expect(byId.get('eqv.promoteTemplate')).toMatchObject({ concurrency: 'none', permission: 'eqv-studio:layout-publish' });
  });

  it('refuses bundled Template ids and bad input at validate, before any database read', () => {
    const promote = (contribution.actions ?? []).find((a) => a.spec.id === 'eqv.promoteTemplate');
    const good = { layoutId: 'my-layout', revision: `sha256:${'a'.repeat(64)}`, templateId: 'my-template', name: 'Mine' };
    expect(promote?.validate(good)).toEqual([]);
    expect(promote?.validate({ ...good, templateId: 'cluster-single' })).toEqual([{ path: ['templateId'], code: 'bundled_template_id' }]);
    expect(promote?.validate({ ...good, revision: 'abc' })).toEqual([{ path: ['revision'], code: 'invalid' }]);
  });
});
