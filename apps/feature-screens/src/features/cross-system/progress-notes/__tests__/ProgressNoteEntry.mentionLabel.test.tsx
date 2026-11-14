import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors: vi.fn() }));

import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { ProgressNoteEntry } from '../ProgressNoteEntry';
import type { ProgressNoteDto } from '../useProgressNotes';

const body = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '확인 요청 ' },
        { type: 'mention', attrs: { actor_id: 'actor-1' } },
        { type: 'text', text: ' ' },
        { type: 'mention', attrs: { actor_id: 'gone-9' } },
      ],
    },
  ],
};

function renderEntry() {
  const entry = {
    id: 'n-1',
    kind: 'note',
    body_rich_content: body,
    created_at: '2026-05-01T00:00:00Z',
  } as unknown as ProgressNoteDto;
  return render(
    <ProgressNoteEntry
      entry={entry}
      kindBadgeLabel="메모"
      actorFallbackName="알 수 없음"
      renderStatusBadge={undefined}
      isLast
    />,
  );
}

describe('ProgressNoteEntry mention labels', () => {
  beforeEach(() => {
    vi.mocked(useWorkspaceActors).mockReturnValue({
      actors: [{ id: 'actor-1', display_name: '김하늘' }],
    } as unknown as ReturnType<typeof useWorkspaceActors>);
  });

  it('shows the actor name for a listed id and @멘션 for an unknown id, never the id', async () => {
    const { container } = renderEntry();
    await waitFor(() => expect(container.querySelector('[data-type="mention"]')).not.toBeNull());
    const chips = [...container.querySelectorAll('[data-type="mention"]')].map((n) => n.textContent);
    expect(chips).toEqual(['@김하늘', '@멘션']);
    expect(container.textContent).not.toContain('actor-1');
    expect(container.textContent).not.toContain('gone-9');
    expect(screen.getByTestId('progress-note-entry')).toBeInTheDocument();
  });
});
