import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostSeam } from '../../../lib/host/host-seam';
import type { LifecycleApi, ReadState, ScreenProps } from '../contracts';
import { LifecycleHost } from '../host';
import { RequestsScreen } from '../RequestsScreen';
import { isRequestPeriodValue } from '../requestPeriod';
import { fakeUi } from './presentation';

/** A viewer in Berlin: the host notation zone is the zone the period inputs read and write (#2587). */
const berlin: NonNullable<HostSeam['time']> = { timeZone: 'Europe/Berlin', list: at => `list:${at}`, summary: at => `summary:${at}`, feed: at => ({ text: `feed:${at}` }) };
function setup(initial: Record<string, string> = {}) {
  const reads: Record<string, unknown>[] = [];
  const writes: Record<string, string | undefined>[] = [];
  function Host() {
    const [state, setState] = useState<Record<string, string>>(initial);
    const api: LifecycleApi = {
      useRead: <T,>(name: string, params: Record<string, unknown>): ReadState<T> => { if (name === 'requests') reads.push(params); return { status: 'done', data: (name === 'requests' ? { rows: [], total: 0 } : null) as T | null, retry: vi.fn() }; },
      useAction: () => ({ pending: false, run: vi.fn() }),
    };
    const props: ScreenProps = {
      api, ui: fakeUi(), canProject: true, canRound: true, actorId: 'actor', setSelection: vi.fn(), state,
      setState: patch => { writes.push(patch); setState(previous => { const next = { ...previous }; for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete next[key]; else next[key] = value; } return next; }); },
    };
    return <LifecycleHost navigate={vi.fn()} time={berlin}><RequestsScreen {...props} /></LifecycleHost>;
  }
  render(<Host />);
  // The period inputs live in the filter disclosure.
  fireEvent.click(screen.getByRole('button', { name: /추가 필터/ }));
  return { reads, writes, lastRead: () => reads.at(-1) };
}
afterEach(cleanup);

describe('request period filter in the viewer zone (#2587)', () => {
  it('writes a typed Berlin time with its offset and reads that instant', () => {
    const t = setup();
    fireEvent.change(screen.getByLabelText('요청 시작'), { target: { value: '2026-11-07T09:30' } });
    expect(t.writes.at(-1)).toMatchObject({ requestedFrom: '2026-11-07T09:30+01:00' });
    expect(t.lastRead()).toMatchObject({ from: '2026-11-07T09:30:00+01:00' });
    expect((screen.getByLabelText('요청 시작') as HTMLInputElement).value).toBe('2026-11-07T09:30');
  });
  it('reads an old offset-less link as +09:00, shows the Berlin equivalent and leaves the URL alone', () => {
    const t = setup({ requestedFrom: '2026-11-07T09:30', requestedTo: '2026-11-08T09:30' });
    expect((screen.getByLabelText('요청 시작') as HTMLInputElement).value).toBe('2026-11-07T01:30');
    expect((screen.getByLabelText('요청 종료, 미포함') as HTMLInputElement).value).toBe('2026-11-08T01:30');
    expect(t.lastRead()).toMatchObject({ from: '2026-11-07T09:30:00+09:00', to: '2026-11-08T09:30:00+09:00' });
    expect(t.writes).toEqual([]);
  });
  it('labels the period inputs without KST', () => {
    setup();
    expect(screen.getByLabelText('요청 시작')).toBeInTheDocument();
    expect(screen.getByLabelText('요청 종료, 미포함')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/KST/);
  });
});

describe('request period URL value', () => {
  it.each(['2026-11-07T09:30', '2026-11-07T09:30+01:00', '2026-11-07T09:30-05:00', '2026-11-07T09:30+00:00'])('accepts %s', value => {
    expect(isRequestPeriodValue(value)).toBe(true);
  });
  it.each(['', 'garbage', '2026-11-07', '2026-11-07T09:30:00', '2026-11-07T09:30Z', '2026-11-07T09:30+0100', '2026-02-30T09:30', '2026-11-07T24:30', '2026-11-07T09:30+25:00'])('rejects %s', value => {
    expect(isRequestPeriodValue(value)).toBe(false);
  });
});
