import { describe, expect, it } from 'vitest';
import { parseFixedEquipmentLimit } from '../i18n';

describe('parseFixedEquipmentLimit', () => {
  it('reads the selected count from a leading limit code', () => {
    expect(parseFixedEquipmentLimit('fixed_equipment_limit: 25/24')).toEqual({ kind: 'selected', count: 25, limit: 24 });
  });

  it.each(['time_domain_unverified', 'time_domain_mismatch'])('reads the remaining count after %s', code => {
    expect(parseFixedEquipmentLimit(`${code} · fixed_equipment_limit: 36/24`)).toEqual({ kind: 'remaining', count: 36, limit: 24 });
  });

  it.each([
    '', '36/', '/24', '0/24', '36/0', '-36/24', '36.5/24', '36/24.5', 'x/24', '36/x',
    '24/24', '23/24', '9007199254740993/24', '36/24\n',
  ])('rejects unreadable or in-limit counts (%j) in either position', counts => {
    expect(parseFixedEquipmentLimit(`fixed_equipment_limit: ${counts}`)).toBeUndefined();
    expect(parseFixedEquipmentLimit(`time_domain_unverified · fixed_equipment_limit: ${counts}`)).toBeUndefined();
  });

  it.each([undefined, 'time_domain_unverified', 'time_domain_unverified: fixed_equipment_limit 36/24'])('rejects messages outside the vocabulary (%j)', message => {
    expect(parseFixedEquipmentLimit(message)).toBeUndefined();
  });
});
