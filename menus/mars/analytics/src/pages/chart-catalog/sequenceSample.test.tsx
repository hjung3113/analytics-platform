// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import { afterEach, expect, it, vi } from 'vitest';
import {
  loadSequenceRange,
  sequenceItems,
  sequenceLanes,
  sequenceMarkers,
} from './sequenceSampleData';
import { SequenceSample } from './SequenceSample';
import { isCatalogKind } from '../../endpoints';
import { supportFor } from './support';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('declares the additive sequence kind with honest text/brush support and thousands of synthetic items', () => {
  expect(isCatalogKind('sequence')).toBe(true);
  expect(sequenceItems.length).toBeGreaterThan(2900);
  expect(sequenceItems.length).toBeLessThan(3400);
  expect(sequenceLanes).toHaveLength(12);
  expect(sequenceMarkers.some((marker) => marker.kind === 'inversion')).toBe(true);
  expect(sequenceItems.some((item) => item.kind !== 'point' && item.orderEnd === undefined)).toBe(
    true,
  );
  expect(sequenceItems.some((item) => item.carryover)).toBe(true);
  expect(supportFor('sequence', {}).find((cell) => cell.id === 'table')?.status).toBe('supported');
  expect(supportFor('sequence', {}).find((cell) => cell.id === 'export')?.status).toBe(
    'unsupported',
  );
});
it('waits 600ms, filters the order window, and aborts immediately without leaving a timer', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const request = loadSequenceRange(3900, 4450, controller.signal);
  let done = false;
  void request.then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(599);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(
    (await request).every((item) => item.orderStart <= 4450 && (item.orderEnd ?? 12000) >= 3900),
  ).toBe(true);
  const cancelled = loadSequenceRange(1, 12000, controller.signal);
  const rejection = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejection;
  expect(vi.getTimerCount()).toBe(0);
});
it('forwards range failures to the consumer page-head assessment callback', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const onLoadStateChange = vi.fn();
  render(
    <I18nProvider>
      <SequenceSample
        height={288}
        onLoadStateChange={onLoadStateChange}
        loader={async () => {
          throw new Error('synthetic failure');
        }}
      />
    </I18nProvider>,
  );
  await act(async () => {});
  expect(onLoadStateChange).toHaveBeenLastCalledWith('error');
  expect(screen.getByText('구간 불러오기 실패')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await act(async () => {});
  expect(onLoadStateChange.mock.calls.filter((call) => call[0] === 'error')).toHaveLength(2);
});
