import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostSeam } from '../../../lib/host/host-seam';
import type { LifecycleApi, ReadState, ScreenProps } from '../contracts';
import { MenuQueryHost } from '../../../lib/host/MenuQueryHost';
import { pageCopy } from '../messages';
import { RequestsScreen } from '../RequestsScreen';
import { isRequestPeriodValue, requestPeriodInstant } from '../requestPeriod';
import { fakeUi } from './presentation';

type TimeInput = NonNullable<NonNullable<HostSeam['time']>['input']>;
/**
 * A host input adapter for a viewer in Berlin, as a table: the real host passes the SDK zoned-instant helpers (tested in the
 * log-models menu); here the screen only has to honour what the seam answers (#2587).
 */
const LOCAL_TO_INSTANT: Record<string, ReturnType<TimeInput['fromLocal']>> = {
  '2026-11-07T09:30': { ok: true, instant: '2026-11-07T08:30:00.000Z' },
  '2026-11-07T15:15': { ok: true, instant: '2026-11-07T09:30:00.000Z' },
  '2026-11-07T06:00': { ok: true, instant: '2026-11-07T09:30:00.000Z' },
  '2026-03-29T02:30': { ok: false, reason: 'gap' },
  '2026-10-25T02:30': { ok: false, reason: 'fold' },
};
const INSTANT_TO_LOCAL: Record<string, string> = { '2026-11-07T00:30:00.000Z': '2026-11-07T01:30', '2026-11-08T00:30:00.000Z': '2026-11-08T01:30', '2026-11-07T08:30:00.000Z': '2026-11-07T09:30' };
const berlinInput: TimeInput = { toLocal: instant => INSTANT_TO_LOCAL[new Date(instant).toISOString()] ?? null, fromLocal: local => LOCAL_TO_INSTANT[local] ?? { ok: false, reason: 'format' } };
const time = (input?: TimeInput): NonNullable<HostSeam['time']> => ({ list: at => `list:${at}`, summary: at => `summary:${at}`, feed: at => ({ text: `feed:${at}` }), ...(input ? { input } : {}) });

function setup(initial: Record<string, string> = {}, input: TimeInput | null = berlinInput) {
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
    return <MenuQueryHost navigate={vi.fn()} time={time(input ?? undefined)}><RequestsScreen {...props} /></MenuQueryHost>;
  }
  render(<Host />);
  // The period inputs live in the filter disclosure.
  fireEvent.click(screen.getByRole('button', { name: /추가 필터/ }));
  return { reads, writes, lastRead: () => reads.at(-1) };
}
const startInput = () => screen.getByLabelText('요청 시작') as HTMLInputElement;
afterEach(cleanup);

describe('request period filter in the viewer zone (#2587)', () => {
  it('writes a typed Berlin time with its offset and reads that instant', () => {
    const t = setup();
    fireEvent.change(startInput(), { target: { value: '2026-11-07T09:30' } });
    expect(t.writes.at(-1)).toMatchObject({ requestedFrom: '2026-11-07T09:30+01:00' });
    expect(t.lastRead()).toMatchObject({ from: '2026-11-07T09:30:00+01:00' });
    expect(startInput().value).toBe('2026-11-07T09:30');
  });
  it('reads an old offset-less link as +09:00, shows the Berlin equivalent and leaves the URL alone', () => {
    const t = setup({ requestedFrom: '2026-11-07T09:30', requestedTo: '2026-11-08T09:30' });
    expect(startInput().value).toBe('2026-11-07T01:30');
    expect((screen.getByLabelText('요청 종료, 미포함') as HTMLInputElement).value).toBe('2026-11-08T01:30');
    expect(t.lastRead()).toMatchObject({ from: '2026-11-07T09:30:00+09:00', to: '2026-11-08T09:30:00+09:00' });
    expect(t.writes).toEqual([]);
  });
  it.each([
    ['2026-03-29T02:30', 'gap'],
    ['2026-10-25T02:30', 'fold'],
  ] as const)('refuses %s (a DST %s) with a reason on the input and no URL write', (local, reason) => {
    const t = setup({ requestedFrom: '2026-11-07T09:30' });
    fireEvent.change(startInput(), { target: { value: local } });
    expect(t.writes).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent(pageCopy.periodRefused[reason]);
    expect(startInput()).toHaveAttribute('aria-invalid', 'true');
    expect(startInput().value).toBe(local);
    fireEvent.change(startInput(), { target: { value: '2026-11-07T09:30' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(t.writes.at(-1)).toMatchObject({ requestedFrom: '2026-11-07T09:30+01:00' });
  });
  it.each([
    ['2026-11-07T15:15', '2026-11-07T15:15+05:45'],
    ['2026-11-07T06:00', '2026-11-07T06:00-03:30'],
  ])('writes %s with a non-hour offset as %s', (local, value) => {
    const t = setup();
    fireEvent.change(startInput(), { target: { value: local } });
    expect(t.writes.at(-1)).toMatchObject({ requestedFrom: value });
    expect(t.lastRead()).toMatchObject({ from: `${local}:00${value.slice(-6)}` });
  });
  it('uses the list fallback zone (+09:00) when the host has no input adapter', () => {
    const t = setup({ requestedTo: '2026-11-08T09:30+01:00' }, null);
    expect((screen.getByLabelText('요청 종료, 미포함') as HTMLInputElement).value).toBe('2026-11-08T17:30');
    fireEvent.change(startInput(), { target: { value: '2026-11-07T09:30' } });
    expect(t.writes.at(-1)).toMatchObject({ requestedFrom: '2026-11-07T09:30+09:00' });
  });
  it('labels the period inputs without KST', () => {
    setup();
    expect(startInput()).toBeInTheDocument();
    expect(screen.getByLabelText('요청 종료, 미포함')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/KST/);
  });
});

describe('request period URL value', () => {
  it.each(['2026-11-07T09:30', '2026-11-07T09:30+01:00', '2026-11-07T09:30-05:00', '2026-11-07T09:30+00:00', '2026-11-07T09:30+05:45', '2026-11-07T09:30-03:30', '2026-11-07T09:30+14:00'])('accepts %s', value => {
    expect(isRequestPeriodValue(value)).toBe(true);
  });
  it.each(['', 'garbage', '2026-11-07', '2026-11-07T09:30:00', '2026-11-07T09:30Z', '2026-11-07T09:30+0100', '2026-02-30T09:30', '2026-11-07T24:30', '2026-11-07T09:30+25:00', '2026-11-07T09:30+14:01', '2026-11-07T09:30+09:60'])('rejects %s', value => {
    expect(isRequestPeriodValue(value)).toBe(false);
  });
  it.each([['2026-11-07T09:30+05:45', '2026-11-07T09:30:00+05:45'], ['2026-11-07T09:30-03:30', '2026-11-07T09:30:00-03:30'], ['2026-11-07T09:30', '2026-11-07T09:30:00+09:00']])('reads %s as the server instant %s', (value, wire) => {
    expect(requestPeriodInstant(value)).toBe(wire);
  });
});
