import { configureApiClient } from '../../../../../lib/api/client';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AttachmentChip } from '../../detail/AttachmentChip';

const ATTACHMENT = { id: 'bbbb2222-0000-4000-8000-000000000001', name: 'log.txt', size_bytes: 512 };

afterEach(() => {
  configureApiClient({ basePath: '' });
});

describe('<AttachmentChip> download href', () => {
  it('follows the API client base path behind a host prefix', () => {
    configureApiClient({ basePath: '/api/features' });
    render(<AttachmentChip attachment={ATTACHMENT} />);
    expect(screen.getByTestId('attachment-chip').getAttribute('href')).toBe(
      `/api/features/attachments/${ATTACHMENT.id}/download`,
    );
  });

  it('is unchanged without one (the standalone app)', () => {
    render(<AttachmentChip attachment={ATTACHMENT} />);
    expect(screen.getByTestId('attachment-chip').getAttribute('href')).toBe(
      `/attachments/${ATTACHMENT.id}/download`,
    );
  });
});

it('path values are validated', () => {
  render(<AttachmentChip attachment={{ ...ATTACHMENT, id: 'invalid-id' }} />);
  expect(screen.getByTestId('attachment-chip').getAttribute('href')).toBeNull();
});

// #3147: the chip is `surface-card` white and its hover was `surface-card-elevated`, the same white (tokens.css).
it('shows hover with the shared row hover, not another white token', () => {
  render(<AttachmentChip attachment={ATTACHMENT} />);
  const hover = Array.from(screen.getByTestId('attachment-chip').classList).filter((name) => name.startsWith('hover:bg-'));
  expect(hover).toEqual(['hover:bg-surface-row-hover']);
});
