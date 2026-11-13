import { describe, expect, it } from 'vitest';
import type { AuditTarget, GlobalContext } from '@ap/contracts';
import { auditDestination, type ResolveLink } from './audit-destination';

// The injected resolver answers like the kernel's resolveLink: registered (`link`, with `allowed`) or not in this assembly (`none`).
const recording = (answer: 'link' | 'denied' | 'none' = 'link') => {
  const calls: { menuId: string; options?: Parameters<ResolveLink>[1] }[] = [];
  const linkTo: ResolveLink = (menuId, options) => {
    calls.push({ menuId, options });
    return answer === 'none' ? { kind: 'none', href: null, allowed: false, droppedPageKeys: [] } : { kind: 'link', href: `/linked/${menuId}`, allowed: answer === 'link', droppedPageKeys: [] };
  };
  return { linkTo, calls };
};
const target = (over: Partial<AuditTarget>): AuditTarget => ({ type: 'equipment', id: 'MEM-ETCH-0101', scopeId: 'MEM', ...over });

describe('auditDestination (#50: the screen-owned type → menu map)', () => {
  it('links equipment to its audit tab with returnTo and asks for the destination site; the site-boundary clear is the kernel\'s', () => {
    const { linkTo, calls } = recording();
    const link = auditDestination(linkTo, target({ scopeId: 'FDRY' }));
    expect(link).toEqual({ ok: true, href: '/linked/equipment-detail' });
    const options = calls[0]!.options!;
    expect(calls[0]!.menuId).toBe('equipment-detail');
    expect(options.params).toEqual({ equipmentId: 'MEM-ETCH-0101' });
    expect(options.page).toEqual({ tab: 'audit' });
    expect(options.returnTo).toBe(true);
    // Only the scope — no hand-built site clear, and never the equipment id as the analysis Selection (§22).
    expect(options.global).toEqual({ scopeId: 'FDRY' } satisfies Partial<GlobalContext>);
  });

  it('refuses a site-less equipment destination without calling linkTo', () => {
    const { linkTo, calls } = recording();
    expect(auditDestination(linkTo, target({ scopeId: null }))).toEqual({ ok: false });
    expect(calls).toEqual([]);
  });

  it('links metric to its history tab with returnTo and no metric pair, scope or global override', () => {
    const { linkTo, calls } = recording();
    const link = auditDestination(linkTo, target({ type: 'metric', id: 'cycle_time', scopeId: null }));
    expect(link).toEqual({ ok: true, href: '/linked/metric-detail' });
    expect(calls[0]!.menuId).toBe('metric-detail');
    expect(calls[0]!.options).toEqual({ params: { metricId: 'cycle_time' }, page: { tab: 'history' }, returnTo: true });
  });

  it('refuses an unmapped type without calling linkTo', () => {
    const { linkTo, calls } = recording();
    expect(auditDestination(linkTo, target({ type: 'notice' }))).toEqual({ ok: false });
    expect(calls).toEqual([]);
  });

  // #1903: the sample destinations are absent from an in-house assembly; the helper must answer, never throw (06 §22).
  it.each([
    { name: 'an unregistered equipment destination', answer: 'none' as const, over: {} },
    { name: 'an unregistered metric destination', answer: 'none' as const, over: { type: 'metric', id: 'cycle_time', scopeId: null } as Partial<AuditTarget> },
    { name: 'a destination the user may not open', answer: 'denied' as const, over: {} },
  ])('answers { ok: false } for $name', ({ answer, over }) => {
    const { linkTo } = recording(answer);
    expect(auditDestination(linkTo, target(over))).toEqual({ ok: false });
  });
});
