import { describe, expect, it } from 'vitest';
import type { AuditTarget, GlobalContext } from '@ap/contracts';
import { auditDestination, type LinkTo } from './audit-destination';

const recording = () => {
  const calls: { menuId: string; options?: Parameters<LinkTo>[1] }[] = [];
  const linkTo: LinkTo = (menuId, options) => { calls.push({ menuId, options }); return `/linked/${menuId}`; };
  return { linkTo, calls };
};
const target = (over: Partial<AuditTarget>): AuditTarget => ({ type: 'equipment', id: 'ICH-ETCH-0101', scopeId: 'ICH', ...over });

describe('auditDestination (#50: the screen-owned type → menu map)', () => {
  it('links equipment to its audit tab with returnTo, and clears the previous site when scopes differ', () => {
    const { linkTo, calls } = recording();
    const link = auditDestination(linkTo, target({ scopeId: 'CJU' }), 'ICH');
    expect(link).toEqual({ ok: true, href: '/linked/equipment-detail' });
    const options = calls[0]!.options!;
    expect(calls[0]!.menuId).toBe('equipment-detail');
    expect(options.params).toEqual({ equipmentId: 'ICH-ETCH-0101' });
    expect(options.page).toEqual({ tab: 'audit' });
    expect(options.returnTo).toBe(true);
    expect(options.global).toEqual({
      scopeId: 'CJU', roomNames: null, condition: null, selection: null, lotIds: null, recipeIds: null, ppid: null,
    } satisfies Partial<GlobalContext>);
    // §22: the link opens the destination; it never replaces the analysis Selection with the equipment id.
    expect(options.global!.selection).not.toBe('ICH-ETCH-0101');
  });

  it('omits global when the destination site is already the carried scope', () => {
    const { linkTo, calls } = recording();
    expect(auditDestination(linkTo, target({ scopeId: 'ICH' }), 'ICH')).toEqual({ ok: true, href: '/linked/equipment-detail' });
    expect(calls[0]!.options!.global).toBeUndefined();
  });

  it('refuses a site-less equipment destination without calling linkTo', () => {
    const { linkTo, calls } = recording();
    expect(auditDestination(linkTo, target({ scopeId: null }), 'ICH')).toEqual({ ok: false });
    expect(calls).toEqual([]);
  });

  it('links metric to its history tab with returnTo and no metric pair, scope or global override', () => {
    const { linkTo, calls } = recording();
    const link = auditDestination(linkTo, target({ type: 'metric', id: 'cycle_time', scopeId: null }), 'ICH');
    expect(link).toEqual({ ok: true, href: '/linked/metric-detail' });
    expect(calls[0]!.menuId).toBe('metric-detail');
    expect(calls[0]!.options).toEqual({ params: { metricId: 'cycle_time' }, page: { tab: 'history' }, returnTo: true });
  });

  it('refuses an unmapped type without calling linkTo', () => {
    const { linkTo, calls } = recording();
    expect(auditDestination(linkTo, target({ type: 'notice' }), 'ICH')).toEqual({ ok: false });
    expect(calls).toEqual([]);
  });
});
