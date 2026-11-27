import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

vi.mock('../../../../lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors: vi.fn(() => ({ actors: [] })) }));

import { registerTaggedTimeHost } from '../../../../test/fixtures/tagged-time';
import { ProgressNoteEntry } from '../ProgressNoteEntry';
import type { ProgressNoteDto } from '../useProgressNotes';

const AT = '2026-05-01T00:00:00Z';
afterEach(cleanup);

describe('ProgressNoteEntry time (#2587)', () => {
  // A note's time is a real instant: its own feed timestamp (relative text, absolute title) beside the kind badge, like the VOC
  // timeline — not a plain string inside the actor chip.
  it('shows the creation time as a host feed timestamp outside the actor chip', async () => {
    onTestFinished(await registerTaggedTimeHost());
    const entry = { id: 'n-1', kind: 'note', body_rich_content: { type: 'doc', content: [] }, created_at: AT } as unknown as ProgressNoteDto;
    render(<ProgressNoteEntry entry={entry} kindBadgeLabel="메모" actorFallbackName="알 수 없음" renderStatusBadge={undefined} isLast />);
    const time = screen.getByText(`feed:${AT}`);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', AT);
    expect(time).toHaveAttribute('title', `title:${AT}`);
  });
});
