// SurveysScreen under a test host seam (#764 l): the screen reads and writes its URL only through the seam, has no router,
// leaves the detail slot to the host's `renderDetail`, and never auto-selects.

import {
  DENIED_ID,
  S1_ID,
  S2_ID,
  STALE_ID,
  installSurveysFetch,
} from '@/features/surveys/__tests__/surveys-seam-fixtures';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SurveysScreen } from '../SurveysScreen';

type Call = { href: string; options: { replace?: boolean } | undefined };
let calls: Call[] = [];
let titles: (string | null)[] = [];
const renderDetail = vi.fn<(...args: unknown[]) => React.ReactNode>();

function record(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, 'http://feedbackops.local').searchParams);
}

function mount(initial: Record<string, string>, hostSeam: Partial<HostSeam> = {}) {
  function Host() {
    const [search, set] = React.useState(initial);
    const seam = React.useMemo<HostSeam>(
      () => ({
        canLink: () => true,
        Link: ({ to, children }) => <a href={to}>{children}</a>,
        notifyError: () => {},
        notifySuccess: () => {},
        useNavigate: () => (href, options) => {
          calls.push({ href, options });
          set(record(href));
        },
        useSearch: () => search,
        useTitle: (title) => {
          titles.push(title);
        },
        ...hostSeam,
      }),
      [search],
    );
    return (
      <HostSeamProvider value={seam}>
        <SurveysScreen renderDetail={renderDetail} />
      </HostSeamProvider>
    );
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls = [];
  titles = [];
  renderDetail.mockReset();
  renderDetail.mockReturnValue(undefined);
  installSurveysFetch();
});
afterEach(cleanup);

describe('SurveysScreen over the host seam', () => {
  it('draws its own Surveys toolbar title standalone and drops it when the host owns the title', async () => {
    const standalone = mount({});
    await screen.findByText('온보딩 설문');
    expect(screen.getByText('Surveys')).toBeTruthy();
    standalone.unmount();
    mount({}, { hostOwnsTitle: true });
    await screen.findByText('온보딩 설문');
    expect(screen.queryByText('Surveys')).toBeNull();
  });

  it('writes selected as a push when a row is picked, and never selects on its own', async () => {
    mount({});
    const row = await screen.findByText('온보딩 설문');
    expect(calls).toEqual([]);
    fireEvent.click(row);
    expect(calls).toEqual([{ href: `/surveys?selected=${S1_ID}`, options: undefined }]);
  });

  it('drops selected with a push on close and keeps the other keys', async () => {
    mount({ selected: S1_ID, status: 'open' });
    await screen.findByText('온보딩 설문');
    const slot = renderDetail.mock.calls.at(-1)?.[1] as { close: () => void };
    slot.close();
    expect(calls).toEqual([{ href: '/surveys?status=open', options: undefined }]);
  });

  it('replace-drops a stale selected after the list loaded, and keeps it while loading', async () => {
    mount({ selected: STALE_ID, status: 'open' });
    expect(calls).toEqual([]);
    await waitFor(() =>
      expect(calls).toEqual([{ href: '/surveys?status=open', options: { replace: true } }]),
    );
  });

  it('removes all filters together in one write', async () => {
    mount({ status: 'open', follow_up: 'needed', selected: S2_ID });
    await screen.findByText('결과 확인 설문');
    fireEvent.click(screen.getByRole('button', { name: /필터 초기화|모두 지우기|초기화/ }));
    expect(calls.at(-1)).toEqual({ href: `/surveys?selected=${S2_ID}`, options: undefined });
  });

  it('sets the title only for the loaded selected record', async () => {
    mount({ selected: S1_ID });
    await waitFor(() => expect(titles).toContain('SRV-1 · 온보딩 설문'));
    expect(titles[0]).toBeNull();
  });

  it('hands the host the selected id and the loaded record', async () => {
    mount({ selected: S1_ID });
    await waitFor(() => {
      const last = renderDetail.mock.calls.at(-1) as [string | null, { survey?: { id: string } }];
      expect(last[0]).toBe(S1_ID);
      expect(last[1].survey?.id).toBe(S1_ID);
    });
  });

  it('keeps an unreadable selected until the list says it is gone', () => {
    mount({ selected: DENIED_ID });
    expect(calls).toEqual([]);
  });
});
