import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Trust } from '@ap/contracts';
import { I18nProvider } from '@ap/kernel';
import { DataTrustIndicator } from '../DataTrustIndicator';

afterEach(cleanup);

const trust: Trust = { updatedAt: '2026-10-16T09:00:00', dataThrough: '2026-10-16T08:00:00', coverage: 0.98, source: 'fixture', provisional: false };
const details = () => screen.getByRole('button', { name: '데이터 신뢰' }).querySelector('[data-trust-summary-details]')!;

describe('DataTrustIndicator wrap (table status line, ADR-0037)', () => {
  it('keeps the non-wrapping default rendering (page header)', () => {
    render(<I18nProvider><DataTrustIndicator trust={trust} assessments={[]} /></I18nProvider>);
    expect(details().className).not.toContain('flex-wrap');
    expect(screen.getByRole('button', { name: '데이터 신뢰' }).className).not.toContain('max-w-full');
  });

  it('lets headline · coverage · updated wrap inside the button when asked', () => {
    render(<I18nProvider><DataTrustIndicator trust={trust} assessments={[]} wrap /></I18nProvider>);
    expect(details().className).toContain('flex-wrap');
    expect(screen.getByRole('button', { name: '데이터 신뢰' }).className).toContain('max-w-full');
  });
});
