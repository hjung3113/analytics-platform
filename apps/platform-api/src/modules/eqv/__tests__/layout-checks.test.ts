import { describe, expect, it } from 'vitest';

import { checkEquipmentLayout, isBundledTemplateId, isLayoutId, nameProblem } from '../domain/layout-checks.js';
import { cyclicLayoutFixture, layoutFixture } from './fixture.js';

describe('eqv layout checks (#1645)', () => {
  it('accepts a valid Equipment Layout and returns the validated layout', () => {
    const checked = checkEquipmentLayout('eqv-test-layout', layoutFixture('eqv-test-layout'));
    expect(checked.ok).toBe(true);
  });

  it('refuses a parentId cycle with the hierarchy-cycle code (EV#170)', () => {
    const checked = checkEquipmentLayout('eqv-test-layout', cyclicLayoutFixture('eqv-test-layout'));
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.errors.map((e) => e.code)).toContain('hierarchy-cycle');
  });

  it('refuses a document whose id differs from the layout id', () => {
    const checked = checkEquipmentLayout('other-layout', layoutFixture('eqv-test-layout'));
    expect(checked).toEqual({ ok: false, errors: [{ path: ['document', 'id'], code: 'id_mismatch' }] });
  });

  it('refuses a non-Equipment-Layout document (a Template)', () => {
    const { templateId: _templateId, ...rest } = layoutFixture('eqv-test-layout');
    const template = { ...rest, kind: 'template', roleCardinality: {} };
    const checked = checkEquipmentLayout('eqv-test-layout', template);
    expect(checked.ok).toBe(false);
  });

  it('refuses a body that is not a Layout and reports plain codes, never zod objects', () => {
    const checked = checkEquipmentLayout('eqv-test-layout', { kind: 'equipment-layout' });
    expect(checked.ok).toBe(false);
    if (!checked.ok) {
      expect(checked.errors.length).toBeGreaterThan(0);
      for (const error of checked.errors) expect(JSON.parse(JSON.stringify(error))).toEqual(error);
    }
  });

  it.each(['cluster-single', 'wet-linear'])('knows the bundled Template id %s', (id) => {
    expect(isBundledTemplateId(id)).toBe(true);
  });
  it('does not treat another id as bundled', () => expect(isBundledTemplateId('my-own-template')).toBe(false));

  it.each([['Bad Id', false], ['good-id', true], ['', false], [7, false]] as const)('isLayoutId(%s) → %s', (value, expected) => {
    expect(isLayoutId(value)).toBe(expected);
  });
  it.each([['  ', true], ['', true], ['ok', false], ['x'.repeat(201), true]] as const)('nameProblem(%j) refuses: %s', (value, refused) => {
    expect(nameProblem(value) !== null).toBe(refused);
  });
});
