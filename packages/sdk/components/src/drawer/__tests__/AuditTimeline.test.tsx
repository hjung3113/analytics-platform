import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type AuditMore } from '@ap/kernel';
import type { AuditEvent } from '@ap/contracts';
import { formatInstant } from '@ap/contracts';
import { AuditTimeline } from '../AuditTimeline';

afterEach(cleanup);

// The Sep 26 +09:00 row is 03:00Z, one hour older than the 04:00Z row, despite sorting first as text.
// The Sep 25 pair are the same instant; their IDs deliberately oppose lexical timestamp order.
const EVENTS: AuditEvent[] = [
  { id: 'e-z', at: '2026-09-26T04:00:00.000Z', actor: 'master-sync', action: 'create', source: 'system', target: { type: 'equipment', id: 'MEM-ETCH-0101', scopeId: 'MEM' }, changes: { chamberType: ['ET-A', 'ET-B'], validTo: [null, '2026-09-26T00:00:00'] } },
  { id: 'e-seoul', at: '2026-09-26T12:00:00+09:00', actor: 'kim.j', action: 'retire', source: 'user', target: { type: 'equipment', id: 'MEM-ETCH-0101', scopeId: 'MEM' } },
  { id: 'a-tie', at: '2026-09-25T03:00:00.000Z', actor: 'actor-tie-a', action: 'update', source: 'user', target: { type: 'equipment', id: 'MEM-ETCH-0101', scopeId: 'MEM' } },
  { id: 'z-tie', at: '2026-09-25T12:00:00+09:00', actor: 'actor-tie-z', action: 'sync', source: 'system', target: { type: 'equipment', id: 'MEM-ETCH-0101', scopeId: 'MEM' } },
];

function Timeline() {
  return <I18nProvider><AuditTimeline events={EVENTS} /></I18nProvider>;
}

describe('AuditTimeline (§6.3: at is a real instant)', () => {
  it('orders by epoch, then by id for equal instants', () => {
    render(<Timeline />);
    const times = screen.getAllByRole('time');
    expect(times).toHaveLength(4);
    expect(times[0].getAttribute('dateTime')).toBe('2026-09-26T04:00:00.000Z');
    expect(times[1].getAttribute('dateTime')).toBe('2026-09-26T12:00:00+09:00');
    expect(times[2].getAttribute('dateTime')).toBe('2026-09-25T03:00:00.000Z');
    expect(times[3].getAttribute('dateTime')).toBe('2026-09-25T12:00:00+09:00');
    expect(screen.getAllByText(/^actor-tie-/).map(actor => actor.textContent)).toEqual(['actor-tie-a', 'actor-tie-z']);
  });

  it('prints formatInstant(at, lang) with the viewer zone applied, never the 16-char slice', () => {
    render(<Timeline />);
    const times = screen.getAllByRole('time');
    // formatInstant applies the viewer zone; equality with the same call pins the component to §6.3
    // rendering (Intl in the viewer's zone) and rules out the old digit slice in every host zone.
    const orderedAts = EVENTS.map(event => event.at).sort((a, b) => {
      const ae = new Date(a).getTime(); const be = new Date(b).getTime();
      return be - ae;
    });
    expect(times.map(time => time.textContent)).toEqual(orderedAts.map(at => formatInstant(at, 'ko')));
    expect(times.map(time => time.textContent)).not.toEqual(orderedAts.map(at => at.slice(0, 16).replace('T', ' ')));
  });

  it('shows changes values digit-for-digit: a naive validTo is text, not an instant', () => {
    render(<Timeline />);
    expect(screen.getByText('2026-09-26T00:00:00')).toBeInTheDocument();
    expect(screen.getByText('ET-A')).toBeInTheDocument();
    expect(screen.getByText('ET-B')).toBeInTheDocument();
  });

  it('translates the source badge like the audit table (ko 시스템/사용자)', () => {
    render(<Timeline />);
    expect(screen.getAllByText('시스템')).toHaveLength(2);
    expect(screen.getAllByText('사용자')).toHaveLength(2);
    expect(screen.queryByText('system')).not.toBeInTheDocument();
  });
});

it('keeps change-field labels readable on tinted change blocks', () => {
  render(<Timeline />);
  for (const field of ['chamberType', 'validTo']) {
    const label = screen.getByText(field);
    expect(label.closest('dl')).toHaveClass('bg-surface-sunken');
    expect(label).toHaveClass('text-text-secondary');
    expect(label).not.toHaveClass('text-text-muted');
  }
});

describe('AuditTimeline older pages (ADR-0085)', () => {
  const ev = (id: string, minute: number): AuditEvent => ({ id, at: `2026-09-01T00:${String(minute).padStart(2, '0')}:00.000Z`, actor: `actor-${id}`, action: 'update', source: 'user', target: { type: 'metric', id: 'm', scopeId: null } });
  const FIRST = [ev('e5', 5), ev('e4', 4)];
  const MORE = [ev('e3', 3), ev('e2', 2)];
  const more = (over: Partial<AuditMore> = {}): AuditMore => ({ status: 'idle', load: vi.fn(), error: null, last: null, ...over });
  const mount = (events: readonly AuditEvent[], m?: AuditMore) => render(<I18nProvider><AuditTimeline events={events} more={m} /></I18nProvider>);
  const again = (view: ReturnType<typeof mount>, events: readonly AuditEvent[], m: AuditMore) => view.rerender(<I18nProvider><AuditTimeline events={events} more={m} /></I18nProvider>);
  const BUTTON = '이전 변경 이력 더 보기';
  const ids = () => screen.getAllByRole('listitem').map(li => li.textContent?.match(/actor-([a-z]\d)/)?.[1]);

  it('renders exactly the plain list without `more`: no control, no status region, no focus targets', () => {
    const { container } = mount(FIRST);
    expect(container.querySelector('ol')?.hasAttribute('aria-busy')).toBe(false);
    expect(container.querySelector('li')?.hasAttribute('tabindex')).toBe(false);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows neither button nor caption when the first page was the whole list', () => {
    mount(FIRST, more({ status: 'end' }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('더 이전 변경 이력이 없습니다.')).toBeNull();
  });

  it('offers the older-changes button after the list and loads on click', () => {
    const m = more();
    mount(FIRST, m);
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));
    expect(m.load).toHaveBeenCalledTimes(1);
  });

  it('keeps label and focusability while loading: aria-disabled and aria-busy, no native disabled, no second load', () => {
    const m = more({ status: 'loading' });
    const { container } = mount(FIRST, m);
    const button = screen.getByRole('button', { name: BUTTON });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
    expect(container.querySelector('ol')).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(m.load).not.toHaveBeenCalled();
  });

  it('returns the list from busy to idle after a load', () => {
    const view = mount(FIRST, more({ status: 'loading' }));
    again(view, [...FIRST, ...MORE], more({ last: { seq: 1, added: 2, firstId: 'e3' } }));
    expect(view.container.querySelector('ol')).toHaveAttribute('aria-busy', 'false');
  });

  it('sorts the appended pages into the whole list', () => {
    const view = mount(FIRST, more());
    again(view, [ev('e2', 2), ...FIRST, ev('e3', 3)], more({ last: { seq: 1, added: 2, firstId: 'e3' } }));
    expect(ids()).toEqual(['e5', 'e4', 'e3', 'e2']);
  });

  it('moves focus to the first appended change when the button still has focus, again for a second batch of the same size', () => {
    const view = mount(FIRST, more());
    screen.getByRole('button', { name: BUTTON }).focus();
    again(view, [...FIRST, ...MORE], more({ last: { seq: 1, added: 2, firstId: 'e3' } }));
    expect(screen.getAllByRole('listitem')[2]).toHaveFocus();
    const next = [ev('d2', 7), ev('d1', 6)];
    screen.getByRole('button', { name: BUTTON }).focus();
    again(view, [...FIRST, ...MORE, ...next], more({ last: { seq: 2, added: 2, firstId: 'd2' } }));
    expect(screen.getAllByRole('listitem')[0]).toHaveFocus();
  });

  it('leaves focus alone when the user moved away from the button during the load', () => {
    const view = mount(FIRST, more({ status: 'loading' }));
    const outside = document.body.appendChild(document.createElement('button'));
    outside.focus();
    again(view, [...FIRST, ...MORE], more({ last: { seq: 1, added: 2, firstId: 'e3' } }));
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('announces how many changes were added through one polite status region', () => {
    const view = mount(FIRST, more());
    again(view, [...FIRST, ...MORE], more({ last: { seq: 1, added: 2, firstId: 'e3' } }));
    expect(screen.getByRole('status')).toHaveTextContent('변경 이력 2건을 더 불러왔습니다.');
  });

  it('replaces the button with the end caption and announces it, focusing the caption when nothing was added', () => {
    const view = mount(FIRST, more());
    screen.getByRole('button', { name: BUTTON }).focus();
    again(view, FIRST, more({ status: 'end', last: { seq: 1, added: 0, firstId: null } }));
    expect(screen.queryByRole('button')).toBeNull();
    const caption = screen.getByText('더 이전 변경 이력이 없습니다.', { selector: 'p.t-caption' });
    expect(caption).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('더 이전 변경 이력이 없습니다.');
  });

  it('ends after appended rows with the count and the end sentence in one announcement, focus on the first new row', () => {
    const view = mount(FIRST, more());
    screen.getByRole('button', { name: BUTTON }).focus();
    again(view, [...FIRST, ...MORE], more({ status: 'end', last: { seq: 1, added: 2, firstId: 'e3' } }));
    expect(screen.getAllByRole('listitem')[2]).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('변경 이력 2건을 더 불러왔습니다. 더 이전 변경 이력이 없습니다.');
    expect(screen.getByText('더 이전 변경 이력이 없습니다.', { selector: 'p.t-caption' })).toBeInTheDocument();
  });

  it('keeps the list and the same focused button on failure: label becomes retry, alert carries the Correlation ID', () => {
    const view = mount(FIRST, more());
    const button = screen.getByRole('button', { name: BUTTON });
    button.focus();
    const m = more({ status: 'error', error: { outcome: 'error', message: 'boom', correlationId: 'corr-9' } });
    again(view, FIRST, m);
    expect(screen.getByRole('button', { name: '다시 시도' })).toBe(button);
    expect(button).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('이전 변경 이력을 불러오지 못했습니다.');
    expect(screen.getByRole('alert')).toHaveTextContent('corr-9');
    expect(ids()).toEqual(['e5', 'e4']);
    fireEvent.click(button);
    expect(m.load).toHaveBeenCalledTimes(1);
  });

  it('offers no button when older changes are forbidden', () => {
    mount(FIRST, more({ status: 'error', error: { outcome: 'forbidden', message: 'No permission', correlationId: 'c' } }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('이전 변경 이력을 볼 권한이 없습니다.')).toBeInTheDocument();
  });

  it('uses the English copy under the en language', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en', setItem: () => undefined });
    try {
      mount(FIRST, more());
      expect(screen.getByRole('button', { name: 'Load older changes' })).toBeInTheDocument();
    } finally { vi.unstubAllGlobals(); }
  });
});
