import { expect, it } from 'vitest';
import { GROUPS } from './menus';

// #201: the sidebar shows the single Overview menu without a section label only because the group declares it.
// Dropping this flag while editing GROUPS would silently add "운영 개요" above the home link.
it('the overview group declares hideLabelWhenSingle (sidebar shows its single menu without a label)', () => {
  expect(GROUPS.find(g => g.id === 'overview')?.hideLabelWhenSingle).toBe(true);
});
