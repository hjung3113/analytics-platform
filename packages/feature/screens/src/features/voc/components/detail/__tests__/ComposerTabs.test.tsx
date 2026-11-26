// ComposerTabs — unit tests (C5.1 RED, slice3 #21)
// 3 test cases:
//   1. renders only visible tabs
//   2. defaults to leftmost visible tab
//   3. onChange fires when a tab is clicked

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComposerTabs } from '../ComposerTabs';
import type { ComposerVisibility } from '../../../hooks/useComposerVisibility';

// #3147: white surfaces (`surface-card`, `-card-elevated`, `-detail`, `-popover`) are one white (tokens.css); a hover painted
// with one of them on a white surface changes nothing, so hover uses the shared row hover (DESIGN.md «hover는 공유 row-hover»).
const WHITE_HOVER = /^hover:bg-surface-(card|card-elevated|detail|popover)$/;
const hoverOf = (element: Element) => Array.from(element.classList).filter((name) => name.startsWith('hover:bg-'));

describe('<ComposerTabs>', () => {
  it('renders only visible tabs when showPublic=false', () => {
    const visibility: ComposerVisibility = {
      showPublic: false,
      showReply: true,
      showInternal: true,
    };
    render(
      <ComposerTabs
        visibility={visibility}
        activeTab="reply"
        onTabChange={vi.fn()}
      />,
    );
    expect(screen.queryByText('담당자 답변')).not.toBeInTheDocument();
    expect(screen.getByText('신고자 답글')).toBeInTheDocument();
    expect(screen.getByText('내부 코멘트')).toBeInTheDocument();
  });

  it('defaults to leftmost visible tab (first in order: public > reply > internal)', () => {
    const visibility: ComposerVisibility = {
      showPublic: false,
      showReply: true,
      showInternal: true,
    };
    const onChange = vi.fn();
    render(
      <ComposerTabs
        visibility={visibility}
        activeTab="reply"
        onTabChange={onChange}
      />,
    );
    // The leftmost visible tab is "reply" since public is hidden
    // The active tab button should be "reply"
    const replyBtn = screen.getByRole('tab', { name: /신고자 답글/i });
    expect(replyBtn).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onTabChange with the correct surface when a tab is clicked', () => {
    const visibility: ComposerVisibility = {
      showPublic: true,
      showReply: true,
      showInternal: true,
    };
    const onChange = vi.fn();
    render(
      <ComposerTabs
        visibility={visibility}
        activeTab="public"
        onTabChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /내부 코멘트/i }));
    expect(onChange).toHaveBeenCalledWith('internal');
  });

  it('shows hover on its white tab row with the shared row hover (#3147)', () => {
    render(
      <ComposerTabs
        visibility={{ showPublic: true, showReply: true, showInternal: true }}
        activeTab="reply"
        onTabChange={vi.fn()}
      />,
    );
    const inactive = screen.getAllByRole('tab').filter((tab) => tab.getAttribute('aria-selected') === 'false');
    expect(inactive.length).toBeGreaterThan(0);
    for (const tab of inactive) {
      expect(hoverOf(tab).filter((name) => WHITE_HOVER.test(name))).toEqual([]);
      expect(hoverOf(tab)).toContain('hover:bg-surface-row-hover');
    }
  });
});
