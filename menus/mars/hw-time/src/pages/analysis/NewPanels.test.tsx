import { describe, expect, it } from 'vitest';
import { HW_TIME_NEW_PANEL_MESSAGES as N } from '../../messages';

describe('Pareto population copy', () => {
  it('describes equipment–Module–Motion mean judgements in English', () => {
    expect(N.paretoNote.en).toMatch(/mean judgements/);
    expect(N.paretoNote.en).toContain('equipment–Module–Motion');
  });
});
