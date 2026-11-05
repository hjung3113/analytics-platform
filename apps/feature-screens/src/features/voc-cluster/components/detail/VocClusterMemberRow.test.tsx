import { FINDING_SEVERITY_LABELS } from '@/lib/copy/enum-labels';
import { findingSeveritySchema } from '@ap/feature-shared';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VocClusterMemberRow } from './VocClusterMemberRow';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

describe('VocClusterMemberRow', () => {
  it.each(['긴 VOC 제목', ''])('keeps a member number unbroken (title=%s)', (title) => {
    render(<VocClusterMemberRow member={{ voc_id: 'v1', added_by: 'a1', added_at: '2026-07-10T00:00:00.000Z', display_id: 'VOC-1021', title }} last canRemove={false} onRemove={vi.fn()} isRemoving={false} />);
    expect(screen.getByText('VOC-1021')).toHaveClass('whitespace-nowrap', 'shrink-0');
  });

  it.each(['긴 VOC 제목', ''])('bounds a long member ID and preserves its full value (title=%s)', (title) => {
    const displayId = 'VOC-1234567890123456789';
    render(<VocClusterMemberRow member={{ voc_id: 'v1', added_by: 'a1', added_at: '2026-07-10T00:00:00.000Z', display_id: displayId, title, severity: 'high', reporter_facing_status: 'received' }} last canRemove onRemove={vi.fn()} isRemoving={false} />);
    const id = screen.getByText(displayId);
    expect(id).toHaveAttribute('title', displayId);
    const row = screen.getByTestId('cluster-member-row-v1');
    expect(row.firstElementChild).toHaveClass('min-w-0', 'flex-1');
    if (title !== '') {
      expect(id).toHaveClass('max-w-full', 'truncate', 'whitespace-nowrap');
      expect(id.parentElement).toHaveClass('flex', 'flex-wrap', 'min-w-0');
    } else {
      expect(id.closest('div')).toHaveClass('truncate');
    }
    expect(screen.getByRole('button', { name: 'VOC 제거' })).toBeEnabled();
  });

  it.each(findingSeveritySchema.options)(
    'renders a display label for member severity %s',
    (severity) => {
      render(
        <VocClusterMemberRow
          member={{
            voc_id: '20000000-0000-4000-8000-000000000002',
            added_by: '50000000-0000-4000-8000-000000000005',
            added_at: '2026-07-10T00:00:00.000Z',
            severity,
          }}
          last
          canRemove={false}
          onRemove={vi.fn()}
          isRemoving={false}
        />,
      );

      expect(screen.getByText(new RegExp(FINDING_SEVERITY_LABELS[severity]))).toBeInTheDocument();
      expect(screen.queryByText(severity, { exact: true })).not.toBeInTheDocument();
    },
  );
});
