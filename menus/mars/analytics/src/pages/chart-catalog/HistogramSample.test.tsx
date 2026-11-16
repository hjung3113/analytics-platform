// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import { afterEach, expect, it, vi } from 'vitest';
import { HistogramSample, histogramSampleValues } from './HistogramSample';

await vi.hoisted(async () => (await import('@ap/components/testing/engines')).mockEchartsCanvas());
afterEach(cleanup);

it('opens a synthetic histogram example with 1,240 observations, reference line and status', async () => {
  expect(histogramSampleValues).toHaveLength(1240);
  expect(histogramSampleValues.some(value => value >= 6.5 && value <= 7.6)).toBe(true);
  render(<I18nProvider><HistogramSample height={280} /></I18nProvider>);
  const disclosure = screen.getByText('히스토그램 · 합성 데이터').closest('details')!;
  disclosure.open = true;
  fireEvent(disclosure, new Event('toggle'));
  expect(await screen.findByRole('img', { name: '분포 · PM2 · Pump' })).toBeTruthy();
  expect(screen.getByText('PM2 · Pump 회차 1,240개 · 설비 24')).toBeTruthy();
  expect(screen.getAllByText(/HTM 상한 초과/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(screen.getByRole('table').textContent).toContain('■ HTM 상한 초과');
  expect(screen.queryByRole('checkbox')).toBeNull();
});
