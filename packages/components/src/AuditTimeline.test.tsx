import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { AuditEvent } from '@ap/contracts';
import { formatInstant } from '@ap/contracts';
import { AuditTimeline } from './AuditTimeline';

afterEach(cleanup);

// One instant written both ways: `+09:00` is three hours later than the Z row, so string compare would
// sort it first and print the wrong hour.
const EVENTS: AuditEvent[] = [
  { id: 'e-z', at: '2026-09-26T02:00:00.000Z', actor: 'master-sync', action: 'create', source: 'system', target: { type: 'equipment', id: 'ICH-ETCH-0101', scopeId: 'ICH' }, changes: { chamberType: ['ET-A', 'ET-B'], validTo: [null, '2026-09-26T00:00:00'] } },
  { id: 'e-seoul', at: '2026-09-26T12:00:00+09:00', actor: 'kim.j', action: 'retire', source: 'user', target: { type: 'equipment', id: 'ICH-ETCH-0101', scopeId: 'ICH' } },
];

function Timeline() {
  return <I18nProvider><AuditTimeline events={EVENTS} /></I18nProvider>;
}

describe('AuditTimeline (§6.3: at is a real instant)', () => {
  it('orders by instant, not by string: the +09:00 row (later) renders first', () => {
    render(<Timeline />);
    const times = screen.getAllByRole('time');
    expect(times).toHaveLength(2);
    expect(times[0]).toHaveAttribute('dateTime', '2026-09-26T12:00:00+09:00');
    expect(times[1]).toHaveAttribute('dateTime', '2026-09-26T02:00:00.000Z');
  });

  it('prints formatInstant(at, lang) with the viewer zone applied, never the 16-char slice', () => {
    render(<Timeline />);
    const times = screen.getAllByRole('time');
    // formatInstant applies the viewer zone; equality with the same call pins the component to §6.3
    // rendering (Intl in the viewer's zone) and rules out the old digit slice in every host zone.
    expect(times[0].textContent).toBe(formatInstant('2026-09-26T12:00:00+09:00', 'ko'));
    expect(times[0].textContent).not.toBe('2026-09-26 12:00');
    expect(times[1].textContent).toBe(formatInstant('2026-09-26T02:00:00.000Z', 'ko'));
    expect(times[1].textContent).not.toBe('2026-09-26 02:00');
  });

  it('shows changes values digit-for-digit: a naive validTo is text, not an instant', () => {
    render(<Timeline />);
    expect(screen.getByText('2026-09-26T00:00:00')).toBeInTheDocument();
    expect(screen.getByText('ET-A')).toBeInTheDocument();
    expect(screen.getByText('ET-B')).toBeInTheDocument();
  });
});
