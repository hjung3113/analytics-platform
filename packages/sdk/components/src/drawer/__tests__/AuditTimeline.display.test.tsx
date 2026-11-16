import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { AuditEvent } from '@ap/contracts';
import { AuditTimeline } from '../AuditTimeline';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const events: readonly AuditEvent[] = [{ id: 'e1', at: '2026-11-17T00:00:00Z', actor: 'actor-1', action: 'update', source: 'user', target: { type: 'item', id: 'one', scopeId: null }, changes: { upper: ['10', '20'], lower: [null, '5'], raw: ['before', 'after'] } }];

it('default audit display preserves original markup, actor, keys and values', () => {
  const { container } = render(<I18nProvider><AuditTimeline events={events} /></I18nProvider>);
  expect(screen.getByText('actor-1')).not.toHaveAttribute('title');
  expect(screen.getByText('upper')).toHaveRole('term');
  expect(screen.getByText('∅')).toBeVisible();
  expect(container.innerHTML).toMatchSnapshot();
});

it.each([
  ['ko', '상한', '하한'], ['en', 'Upper bound', 'Lower bound'],
] as const)('displays %s field labels and formats both values including null without changing raw events', (lang, upper, lower) => {
  vi.stubGlobal('localStorage', { getItem: () => lang, setItem: () => undefined });
  const before = JSON.stringify(events);
  const format = vi.fn((value: unknown) => value === null ? 'Unset' : `${value} s`);
  const { container } = render(<I18nProvider><AuditTimeline events={events} fields={{ upper: { label: { ko: '상한', en: 'Upper bound' }, format }, lower: { label: { ko: '하한', en: 'Lower bound' }, format } }} /></I18nProvider>);
  expect(screen.getByRole('term', { name: upper })).toBeVisible();
  expect(screen.getByRole('term', { name: lower })).toBeVisible();
  expect(screen.getByText('10 s')).toBeVisible(); expect(screen.getByText('20 s')).toBeVisible();
  expect(screen.getByText('Unset')).toBeVisible(); expect(screen.getByText('5 s')).toBeVisible();
  expect(container.querySelector('dl')).toHaveTextContent(`${upper}10 s → 20 s${lower}Unset → 5 srawbefore → after`);
  expect(screen.getByText('raw')).toHaveRole('term');
  expect(format.mock.calls).toEqual([['10'], ['20'], [null], ['5']]);
  expect(JSON.stringify(events)).toBe(before);
});

it('resolves an actor name while retaining the raw identity in its title; undefined falls back unchanged', () => {
  const actorName = vi.fn((actor: string) => actor === 'actor-1' ? 'Jane Kim' : undefined);
  const before = JSON.stringify(events);
  const { rerender } = render(<I18nProvider><AuditTimeline events={events} actorName={actorName} /></I18nProvider>);
  expect(screen.getByText('Jane Kim')).toHaveAttribute('title', 'actor-1');
  expect(actorName).toHaveBeenCalledWith('actor-1');
  expect(JSON.stringify(events)).toBe(before);
  rerender(<I18nProvider><AuditTimeline events={events} actorName={() => undefined} /></I18nProvider>);
  expect(screen.queryByText('Jane Kim')).toBeNull();
  expect(screen.getByText('actor-1')).not.toHaveAttribute('title');
});

it('label-only entries preserve values and null symbols; inherited record keys are raw fields', () => {
  render(<I18nProvider><AuditTimeline events={[{ ...events[0], changes: { lower: [null, '5'], constructor: ['old', 'new'] as [string, string] } }]} fields={{ lower: { label: { ko: '하한', en: 'Lower bound' } } }} /></I18nProvider>);
  expect(screen.getByRole('term', { name: '하한' })).toBeVisible();
  expect(screen.getByText('∅')).toBeVisible(); expect(screen.getByText('5')).toBeVisible();
  expect(screen.getByText('constructor')).toHaveRole('term');
});
