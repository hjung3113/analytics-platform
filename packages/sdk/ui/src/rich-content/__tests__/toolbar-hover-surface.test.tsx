import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RichEditorImpl from '../RichEditorImpl';

// #3149: the toolbar band is white (`surface-band`); a white hover on its attach button changes nothing, so hover uses the
// shared row hover (DESIGN.md «hover는 공유 row-hover»).
describe('RichEditorToolbar hover (#3149)', () => {
  it('shows hover on the attach button with the shared row hover', async () => {
    render(<RichEditorImpl surface="voc-description" onAttach={vi.fn()} />);
    const attach = await screen.findByTestId('rich-toolbar-attach');
    const hover = Array.from(attach.classList).filter(name => name.startsWith('hover:bg-'));
    expect(hover.filter(name => /^hover:bg-surface-(card|card-elevated|detail|popover)$/.test(name))).toEqual([]);
    expect(hover).toContain('hover:bg-surface-row-hover');
  });
});
