import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../EditDescriptionModal', () => ({ EditDescriptionModal: () => null }));

import { DescriptionSection } from '../DescriptionSection';
import { DETAIL_ENVELOPE } from './_fixtures';

const ATTACHMENT_ID = '78fba6fa-1b2c-4d3e-8f90-123456789abc';

describe('<DescriptionSection> attachment names (#745)', () => {
  it('shows the linked file name in the body, never the attachment UUID', () => {
    const voc = {
      ...DETAIL_ENVELOPE,
      description_rich_content: {
        type: 'doc',
        content: [{ type: 'attachmentRef', attrs: { id: ATTACHMENT_ID } }],
      },
      attachments: [
        {
          id: ATTACHMENT_ID,
          name: 'editor-attach.txt',
          size_bytes: 2048,
          mime_type: 'text/plain',
          uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
          created_at: '2026-05-22T10:00:00.000Z',
          linked_at: '2026-05-22T10:00:00.000Z',
        },
      ],
    };
    const { container } = render(<DescriptionSection voc={voc} isReporterOnOwnVoc={false} />);
    const card = container.querySelector('[data-testid="description-body-card"]');
    expect(card?.querySelector('.attachment-id')?.textContent).toBe('editor-attach.txt');
    expect(card?.textContent).not.toContain(ATTACHMENT_ID);
  });
});
