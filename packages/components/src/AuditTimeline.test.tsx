import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { AuditEvent } from '@ap/contracts';
import { formatInstant } from '@ap/contracts';
import { AuditTimeline } from './AuditTimeline';

afterEach(cleanup);

// The Sep 26 +09:00 row is 03:00Z, one hour older than the 04:00Z row, despite sorting first as text.
// The Sep 25 pair are the same instant; their IDs deliberately oppose lexical timestamp order.
const EVENTS: AuditEvent[] = [
  { id: 'e-z', at: '2026-09-26T04:00:00.000Z', actor: 'master-sync', action: 'create', source: 'system', target: { type: 'equipment', id: 'ICH-ETCH-0101', scopeId: 'ICH' }, changes: { chamberType: ['ET-A', 'ET-B'], validTo: [null, '2026-09-26T00:00:00'] } },
  { id: 'e-seoul', at: '2026-09-26T12:00:00+09:00', actor: 'kim.j', action: 'retire', source: 'user', target: { type: 'equipment', id: 'ICH-ETCH-0101', scopeId: 'ICH' } },
  { id: 'a-tie', at: '2026-09-25T03:00:00.000Z', actor: 'actor-tie-a', action: 'update', source: 'user', target: { type: 'equipment', id: 'ICH-ETCH-0101', scopeId: 'ICH' } },
  { id: 'z-tie', at: '2026-09-25T12:00:00+09:00', actor: 'actor-tie-z', action: 'sync', source: 'system', target: { type: 'equipment', id: 'ICH-ETCH-0101', scopeId: 'ICH' } },
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
});
