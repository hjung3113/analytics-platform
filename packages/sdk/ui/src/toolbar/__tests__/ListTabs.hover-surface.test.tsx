import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListTabs } from '../ListTabs.js';

// #3149: the list toolbar is white (`surface-card`); a white hover on its tabs changes nothing, so hover uses the shared
// row hover (DESIGN.md «hover는 공유 row-hover»).
const WHITE_HOVER = /^hover:bg-surface-(card|card-elevated|detail|popover)$/;
const hoverOf = (element: Element) => Array.from(element.classList).filter((name) => name.startsWith('hover:bg-'));

describe('ListTabs hover (#3149)', () => {
  it('shows hover on each tab and on 더보기 with the shared row hover', () => {
    const tabs = ['가', '나', '다', '라'].map((label, at) => ({ value: String(at), label }));
    render(<ListTabs tabs={tabs} activeTab="0" maxVisible={2} />);
    const controls = [...screen.getAllByRole('tab'), screen.getByRole('button', { name: /^더보기/ })];
    expect(controls).toHaveLength(3);
    for (const control of controls) {
      expect(hoverOf(control).filter((name) => WHITE_HOVER.test(name))).toEqual([]);
      expect(hoverOf(control)).toContain('hover:bg-surface-row-hover');
    }
  });
});
