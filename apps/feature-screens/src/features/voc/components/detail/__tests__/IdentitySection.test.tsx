// The slot omits the body title when the host header already shows it (#1168 C-1);
// the full-page body keeps its title block.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: () => ({ data: undefined }),
}));

import { IdentitySection } from '../IdentitySection';
import { DETAIL_ENVELOPE } from './_fixtures';

function mount(titleInHeader?: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IdentitySection
        voc={DETAIL_ENVELOPE}
        reporterDisplayName="신고자"
        {...(titleInHeader ? { titleInHeader } : {})}
      />
    </QueryClientProvider>,
  );
}

describe('IdentitySection slot title (#1168 C-1)', () => {
  it('renders the title block by default (the full-page body keeps it)', () => {
    mount();

    expect(screen.getByRole('heading', { name: DETAIL_ENVELOPE.title })).toBeInTheDocument();
    expect(screen.getByText('신고자')).toBeInTheDocument();
  });

  it('omits the title when the host header shows it and keeps the status · reporter · time row', () => {
    mount(true);

    expect(screen.queryByRole('heading', { name: DETAIL_ENVELOPE.title })).toBeNull();
    expect(screen.getByText('신고자')).toBeInTheDocument();
  });
});
