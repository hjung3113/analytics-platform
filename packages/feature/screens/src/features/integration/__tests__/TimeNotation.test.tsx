import { type HostSeam, HostSeamProvider } from '../../../lib/host/host-seam';
import { areaReportFixture } from '../../../test/fixtures/area-report';
import { taggedTime } from '../../../test/fixtures/tagged-time';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { AnalyticsAreaReportTable } from '../components/AnalyticsAreaReportTable';
import { RecoveryFreshness } from '../recovery/RecoveryFreshness';

const COMPUTED = '2026-07-20T08:00:00.000Z';
const REFRESHED = '2026-07-20T09:30:00.000Z';

/** The TanStack host with the tagging notation and a router-free link (the components render outside a router here). */
async function wrap(node: ReactNode) {
  const { tanstackHost } = await import('../../../test/host-adapters/lib/host/tanstack-host');
  const Link: HostSeam['Link'] = ({ to, children, ref, ...rest }) => (
    <a href={to} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
      {children}
    </a>
  );
  return render(<HostSeamProvider value={{ ...tanstackHost, Link, time: taggedTime }}>{node}</HostSeamProvider>);
}
afterEach(cleanup);

it('renders the freshness line instants in the summary notation without a UTC label (#2587)', async () => {
  await wrap(<RecoveryFreshness computedAt={COMPUTED} failed={false} updatedAt={Date.parse(REFRESHED)} />);
  const line = screen.getByTestId('recovery-freshness');
  expect(line.textContent).toBe(`서버 계산 시각 · summary:${COMPUTED} · 마지막 성공한 새로고침 · summary:${REFRESHED}`);
  expect(screen.getByText(`summary:${COMPUTED}`)).toHaveAttribute('dateTime', COMPUTED);
  expect(screen.getByText(`summary:${REFRESHED}`)).toHaveAttribute('dateTime', REFRESHED);
  expect(line.textContent).not.toMatch(/UTC/);
});

it('renders the area report computed-at line in the summary notation without a UTC label (#2587)', async () => {
  await wrap(<AnalyticsAreaReportTable report={areaReportFixture} />);
  const value = screen.getByText(`summary:${areaReportFixture.computed_at}`);
  expect(value).toHaveAttribute('dateTime', areaReportFixture.computed_at);
  expect(value.closest('p')?.textContent).toBe(`기준 시각 · summary:${areaReportFixture.computed_at}`);
  expect(screen.getByTestId('analytics-area-report').textContent).not.toMatch(/UTC/);
});
