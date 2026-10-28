// Real RichContentRenderer (no mock): attachment refs in reply bodies resolve to names (#745 FIX1 C1).

import type { ConversationEntry, VocDetailEnvelope } from '@ap/feature-shared';
import type { TipTapDoc } from '@ap/ui';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComposerReplyPreview } from '../ComposerReplyPreview';
import { TimelineEntry } from '../TimelineEntry';

const ATT_ID = '11111111-2222-4333-8444-555555555555';

const DOC = {
  type: 'doc',
  content: [{ type: 'attachmentRef', attrs: { id: ATT_ID } }],
} as unknown as TipTapDoc;

function entry(kind: ConversationEntry['kind']): ConversationEntry {
  return {
    id: 'e-1',
    actor_id: 'actor-99',
    kind,
    visibility: kind === 'internal_comment' ? 'internal' : 'public',
    body_rich_content: DOC,
    created_at: '2026-05-01T00:00:00Z',
    attachments: [{ id: ATT_ID, name: 'reply.pdf' }],
  } as unknown as ConversationEntry;
}

describe('attachment names in reply bodies', () => {
  it('reporter_reply entry body shows the file name, not the UUID', () => {
    const { container } = render(<TimelineEntry entry={entry('reporter_reply')} />);
    const body = container.querySelector('.pl-8') as HTMLElement;
    const rich = body.firstElementChild as HTMLElement;
    expect(within(rich).getByText('reply.pdf')).toBeInTheDocument();
    expect(container.textContent).not.toContain(ATT_ID);
  });

  it('public_update entry still strips the attachment ref from the body', () => {
    const { container } = render(<TimelineEntry entry={entry('public_update')} />);
    const rich = (container.querySelector('.pl-8') as HTMLElement).firstElementChild as HTMLElement;
    expect(within(rich).queryByText('reply.pdf')).toBeNull();
    expect(within(rich).queryByText('첨부 파일')).toBeNull();
  });

  it('composer reply preview shows the fallback label, not the UUID', () => {
    const voc = {
      id: 'v',
      title: 't',
      created_at: '2026-05-01T00:00:00Z',
    } as unknown as VocDetailEnvelope;
    const { container } = render(
      <ComposerReplyPreview
        voc={voc}
        owner={{ id: 'o', display_name: '관리자' }}
        reporter={{ id: 'r', display_name: '리포터' }}
        draftDoc={DOC}
      />,
    );
    expect(screen.getByText('첨부 파일')).toBeInTheDocument();
    expect(container.textContent).not.toContain(ATT_ID);
  });
});
