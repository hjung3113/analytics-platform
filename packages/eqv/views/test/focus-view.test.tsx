// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  bindingsFileSchema, layoutDocumentSchema, mappingVersionSchema, occurrenceBatchSchema, type ReplayInput,
} from '@eqv/core';
import { FocusView, NoticeList } from '../src/index.js';
import { formatRangeDuration } from '../src/FocusView.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

const root = resolve(process.cwd(), '../fixtures/cluster-single');
const read = (path: string): unknown => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const directory = 'onboarding/mappings/eq-synth-01/';
const layout = layoutDocumentSchema.parse(read('layout.json'));
if (layout.kind !== 'equipment-layout') throw new Error('Expected equipment layout');
const input: ReplayInput = {
  batch: occurrenceBatchSchema.parse(read('occurrence-batch.json')), layouts: [layout],
  bindings: bindingsFileSchema.parse(read('onboarding/bindings/eq-synth-01.bindings.json')),
  mappings: readdirSync(resolve(root, directory)).sort().map((file) => mappingVersionSchema.parse(read(directory + file))),
};
const OCCURRENCE = 'occ-pm1-process';
const row = () => document.querySelector(`tr[data-occurrence-id="${OCCURRENCE}"]`)!;
const shownAt = () => within(screen.getByRole('region', { name: '커서 시점 상태' })).getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{3})?$/).textContent;

it('renders the Top View, the Gantt and the Occurrence list from props', () => {
  render(<FocusView input={input} notices={['안내 한 줄', '부분 데이터']} entityType={null} anchor={null} resetKey="a" />);
  const panel = screen.getByRole('region', { name: 'Top View' });
  expect(within(panel).getAllByRole('status')).toHaveLength(1);
  expect(within(panel).getByRole('status').textContent).toBe('안내 한 줄 · 부분 데이터 · 진입 키가 없어 전체 구간을 표시합니다');
  screen.getByRole('heading', { name: 'Top View' });
  screen.getByRole('heading', { name: 'Gantt' });
  expect(row()).toBeTruthy();
  screen.getByRole('tab', { name: '근거 상세' });
});

type Detail = { node: ReactNode; label: string } | null;
/** A host that renders the detail slot it is handed; `attached` false removes the callback. */
function DetailHost({ resetKey = 'a', attached = true, actions }: { resetKey?: string; attached?: boolean; actions?: ReactNode }) {
  const [detail, setDetail] = useState<Detail>(null);
  return (
    <>
      <section aria-label="host-detail">{detail && <><h2>{detail.label}</h2>{detail.node}</>}</section>
      <FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey={resetKey}
        {...(attached ? { renderDetail: setDetail } : {})} {...(actions ? { links: { actions } } : {})} />
    </>
  );
}
const slot = () => screen.getByRole('region', { name: 'host-detail' });

it('renders the evidence detail in the host slot, drops the inline tab, and clears the slot on reset and unmount', () => {
  const view = render(<DetailHost />);
  expect(screen.queryByRole('tab', { name: '근거 상세' })).toBeNull();
  expect(slot().textContent).toBe('');
  fireEvent.click(row());
  expect(within(slot()).getByRole('heading', { name: `근거 상세 · ${OCCURRENCE}` })).toBeTruthy();
  expect(slot().textContent).toContain(OCCURRENCE);
  expect(slot().textContent!.length).toBeGreaterThan(`근거 상세 · ${OCCURRENCE}`.length);
  view.rerender(<DetailHost resetKey="b" />);
  expect(slot().textContent).toBe('');
});

it('publishes the current detail when a callback attaches and clears the old slot when it is removed', () => {
  const view = render(<DetailHost attached={false} />);
  fireEvent.click(row());
  view.rerender(<DetailHost />);
  expect(slot().textContent).toContain(OCCURRENCE);
  view.rerender(<DetailHost attached={false} />);
  expect(slot().textContent).toBe('');
});

it('clears the host detail through the callback on unmount and through the old callback on replacement', () => {
  const calls: Detail[] = [];
  const first = (detail: Detail) => { calls.push(detail); };
  const second = vi.fn();
  const view = render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" renderDetail={first} />);
  fireEvent.click(row());
  expect(calls.at(-1)?.label).toContain(OCCURRENCE);
  view.rerender(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" renderDetail={second} />);
  expect(calls.at(-1)).toBeNull();
  expect(second.mock.lastCall![0].label).toContain(OCCURRENCE);
  view.unmount();
  expect(second.mock.lastCall![0]).toBeNull();
});

it('shows the Occurrence list when a controlled tab is "detail" but the host owns the detail slot', () => {
  render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" renderDetail={vi.fn()} tab="detail" onTabChange={vi.fn()} />);
  expect(screen.getByRole('tab', { name: 'Occurrence 목록' }).getAttribute('aria-selected')).toBe('true');
  expect(row()).toBeTruthy();
});

it('renders links.actions in the Top View action area', () => {
  render(<DetailHost actions={<button type="button">호스트 동작</button>} />);
  const panel = screen.getByRole('heading', { name: 'Top View' }).closest('section, div')!.parentElement!;
  expect(within(panel).getByRole('button', { name: '호스트 동작' })).toBeTruthy();
});

it('resets the cursor and selection when resetKey changes', () => {
  const view = render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" />);
  const initial = shownAt();
  fireEvent.click(row());
  expect(shownAt()).not.toBe(initial);
  expect(row().getAttribute('aria-selected')).toBe('true');
  view.rerender(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="b" />);
  expect(shownAt()).toBe(initial);
  expect(document.querySelector('tr[aria-selected="true"]')).toBeNull();
});

it('Escape on a focused list row closes the host detail slot', () => {
  render(<DetailHost />);
  fireEvent.click(row());
  expect(slot().textContent).not.toBe('');
  fireEvent.keyDown(row(), { key: 'Escape' });
  expect(slot().textContent).toBe('');
});

it('selects the anchored Occurrence on entry and on an entry change, and nothing for no anchor or a missing one', () => {
  const entry = (anchor: string | null, renderDetail?: (d: Detail) => void) =>
    <FocusView input={input} notices={[]} entityType={null} anchor={anchor} resetKey="a" {...(renderDetail ? { renderDetail } : {})} />;
  const selected = () => document.querySelector('tr[aria-selected="true"]')?.getAttribute('data-occurrence-id') ?? null;
  const view = render(entry('occ-pm1-process'));
  expect(selected()).toBe('occ-pm1-process');
  view.rerender(entry('occ-carrier'));
  expect(selected()).toBe('occ-carrier');
  view.rerender(entry(null));
  expect(selected()).toBeNull();
  view.unmount();
  cleanup();
  render(entry(null));
  expect(selected()).toBeNull();
  cleanup();
  render(entry('occ-not-in-batch'));
  expect(selected()).toBeNull();
  cleanup();
  const details: Detail[] = [];
  render(entry('occ-pm1-process', (d) => { details.push(d); }));
  expect(details.at(-1)?.label).toBe('근거 상세 · occ-pm1-process');
});

it('selects the Occurrence whose RecordSequence is a job anchor (AP ADR-0094)', () => {
  render(<FocusView input={input} notices={[]} entityType="job" anchor="18" resetKey="a" />);
  expect(document.querySelector('tr[aria-selected="true"]')?.getAttribute('data-occurrence-id')).toBe('occ-pm1-process');
});

// #2236: the Enter Safari sends right after compositionend in the range form is cancelled, so it never applies the range.
it('the range form does not apply on the Enter that confirms a composition', () => {
  render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" />);
  fireEvent.click(screen.getByRole('button', { name: '변경' }));
  const from = within(screen.getByRole('form', { name: '구간' })).getAllByRole('textbox')[0]!;
  fireEvent.compositionStart(from);
  fireEvent.compositionEnd(from);
  expect(fireEvent.keyDown(from, { key: 'Enter' })).toBe(false);
  expect(fireEvent.keyDown(from, { key: 'Enter' })).toBe(true);
});


const APPLIED = { from: input.batch.from, to: input.batch.to };
const UPDATED = { from: '2026-01-01T10:05:00.000', to: '2026-01-01T10:12:00.000' } as const;
function RangeHost() {
  const [value, setValue] = useState(APPLIED);
  return <FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" range={{ value, onChange: next => { rangeChanged(next); setValue(next); } }} />;
}
const rangeChanged = vi.fn();
const changeRange = () => screen.getByRole('button', { name: '변경' });
const summary = () => screen.getByText(/^재생 구간 /).textContent;

it('summarizes the applied range, keeps its disclosure mounted and preserves drafts across toggles', () => {
  render(<RangeHost />);
  const button = changeRange();
  expect(button.getAttribute('aria-expanded')).toBe('false');
  const region = document.getElementById(button.getAttribute('aria-controls')!)!;
  expect(region).not.toBeNull();
  expect(region.hidden).toBe(true);
  expect(summary()).toBe('재생 구간 2026-01-01 10:00:00 → 2026-01-01 10:30:00 (30분)');
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(region.hidden).toBe(false);
  fireEvent.change(screen.getByLabelText('시작'), { target: { value: UPDATED.from } });
  const applied = summary();
  fireEvent.click(button);
  fireEvent.click(button);
  expect((screen.getByLabelText('시작') as HTMLInputElement).value).toBe(UPDATED.from);
  expect(summary()).toBe(applied);
});

it('applies the expanded range, calls the host, collapses and focuses the change button', () => {
  rangeChanged.mockClear();
  render(<RangeHost />);
  fireEvent.click(changeRange());
  fireEvent.change(screen.getByLabelText('시작'), { target: { value: UPDATED.from } });
  fireEvent.change(screen.getByLabelText('끝'), { target: { value: UPDATED.to } });
  fireEvent.submit(screen.getByRole('form', { name: '구간' }));
  expect(rangeChanged).toHaveBeenCalledExactlyOnceWith(UPDATED);
  expect(summary()).toBe('재생 구간 2026-01-01 10:05:00 → 2026-01-01 10:12:00 (7분)');
  expect(changeRange().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(changeRange());
});

it('keeps an invalid range expanded with the original error and input associations', () => {
  rangeChanged.mockClear();
  render(<RangeHost />);
  fireEvent.click(changeRange());
  const from = screen.getByLabelText('시작');
  fireEvent.change(from, { target: { value: 'invalid' } });
  fireEvent.submit(screen.getByRole('form', { name: '구간' }));
  expect(changeRange().getAttribute('aria-expanded')).toBe('true');
  const error = screen.getByRole('alert');
  expect(error.textContent).toBe('Site Wall-clock 형식(YYYY-MM-DDTHH:mm:ss.fff)이 아닙니다');
  expect(from.getAttribute('aria-invalid')).toBe('true');
  expect(from.getAttribute('aria-describedby')).toBe(error.id);
  expect(rangeChanged).not.toHaveBeenCalled();
});

it.each(['reset', 'entry'])('collapses the range disclosure and clears its draft on %s changes', kind => {
  const view = render(<FocusView input={input} notices={[]} entityType={null} anchor={null} resetKey="a" />);
  fireEvent.click(changeRange());
  fireEvent.change(screen.getByLabelText('시작'), { target: { value: 'draft' } });
  view.rerender(<FocusView input={input} notices={[]} entityType={null} anchor={kind === 'entry' ? OCCURRENCE : null} resetKey={kind === 'reset' ? 'b' : 'a'} />);
  expect(changeRange().getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(changeRange());
  expect((screen.getByLabelText('시작') as HTMLInputElement).value).not.toBe('draft');
});

it('shows trust first in the Top View header', () => {
  render(<FocusView input={input} notices={[]} trust={<span>미확인 상태</span>} entityType={null} anchor={null} resetKey="a" />);
  const header = screen.getByRole('heading', { name: 'Top View' }).parentElement!.parentElement!;
  expect(within(header).getByText('미확인 상태').parentElement!.firstElementChild?.textContent).toBe('미확인 상태');
});

it('keeps trust and the joined notices above the view when Replay cannot render its Top View panel', () => {
  const broken = { ...input, batch: { ...input.batch, to: input.batch.from } };
  render(<FocusView input={broken} notices={['부분 데이터', '호스트 경고']} trust={<span>미확인 상태</span>} entityType={null} anchor={null} resetKey="a" />);
  expect(screen.queryByRole('region', { name: 'Top View' })).toBeNull();
  expect(screen.getAllByText(/Replay 오류:/).length).toBeGreaterThan(0);
  screen.getByText('미확인 상태');
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status').textContent).toBe('부분 데이터 · 호스트 경고 · 진입 키가 없어 전체 구간을 표시합니다');
});

it.each([
  ['2026-01-01T10:30:00.000', '30분'],
  ['2026-01-01T11:30:00.000', '1시간 30분'],
  ['2026-01-01T10:00:45.000', '45초'],
  ['2026-01-01T12:00:00.000', '2시간'],
  ['2026-01-01T10:00:00.001', '0.001초'],
  ['2026-01-01T11:30:45.123', '1시간 30분 45.123초'],
  ['2026-01-02T10:00:00.000', '24시간'],
])('formats the Site Wall-clock duration ending at %s', (to, expected) => {
  expect(formatRangeDuration({ from: APPLIED.from, to: to as typeof APPLIED.to })).toBe(expected);
});


it('renders no notice callout when there are no notices', () => {
  const { container } = render(<NoticeList notices={[]} />);
  expect(container.childElementCount).toBe(0);
});
