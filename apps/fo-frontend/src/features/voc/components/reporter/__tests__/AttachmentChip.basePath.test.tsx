import { configureApiClient } from '@/lib/api/client';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AttachmentChip } from '../../detail/AttachmentChip';

const ATTACHMENT = { id: 'bbbb2222-0000-4000-8000-000000000001', name: 'log.txt', size_bytes: 512 };

afterEach(() => {
  configureApiClient({ basePath: '' });
});

describe('<AttachmentChip> download href', () => {
  it('follows the API client base path behind a host prefix', () => {
    configureApiClient({ basePath: '/api/fo' });
    render(<AttachmentChip attachment={ATTACHMENT} />);
    expect(screen.getByTestId('attachment-chip').getAttribute('href')).toBe(
      `/api/fo/attachments/${ATTACHMENT.id}/download`,
    );
  });

  it('is unchanged without one (the standalone app)', () => {
    render(<AttachmentChip attachment={ATTACHMENT} />);
    expect(screen.getByTestId('attachment-chip').getAttribute('href')).toBe(
      `/attachments/${ATTACHMENT.id}/download`,
    );
  });
});
