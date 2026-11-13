import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Trust } from '@ap/contracts';
import { I18nProvider, useI18n } from '@ap/kernel';
import { useEffect } from 'react';
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

  it('keeps each fragment on one line and the text left-aligned when wrapping (#1942)', () => {
    render(<I18nProvider><DataTrustIndicator trust={trust} assessments={[]} wrap /></I18nProvider>);
    const fragments = [...details().querySelectorAll('.tabular')];
    expect(fragments).toHaveLength(3);
    for (const f of fragments) expect(f).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('button', { name: '데이터 신뢰' })).toHaveClass('text-left');
    expect(details()).toHaveClass('justify-start', 'text-left');
  });

  // jsdom has no layout, so the DOM structure is what pins "a break never leaves the dot or the icon alone".
  it('groups the dot with the headline and the info icon with the last fragment in nowrap units when wrapping (#1942)', () => {
    render(<I18nProvider><DataTrustIndicator trust={trust} assessments={[]} wrap /></I18nProvider>);
    const [headline, , updated] = [...details().querySelectorAll('.tabular')];
    const first = headline!.parentElement!, last = updated!.parentElement!;
    expect(first).toHaveClass('whitespace-nowrap');
    expect(first.querySelector('.rounded-pill')).not.toBeNull();
    expect(last).toHaveClass('whitespace-nowrap');
    expect(last.querySelector('svg')).not.toBeNull();
    expect(first).not.toBe(last);
  });

  it('groups the info icon with the no-Trust text when wrapping (#1942)', () => {
    render(<I18nProvider><DataTrustIndicator trust={null} assessments={[{ kind: 'collection', state: 'unknown', statusSource: 'fixture', observedAt: '2026-10-16T09:00:00', reason: 'check_failed' }]} showWithoutTrust wrap /></I18nProvider>);
    const text = [...details().querySelectorAll('.tabular')].at(-1)!;
    expect(text.parentElement).toHaveClass('whitespace-nowrap');
    expect(text.parentElement!.querySelector('svg')).not.toBeNull();
  });
});

describe('source logic versions', () => {
  function English() {
    const { setLang } = useI18n();
    useEffect(() => setLang('en'), [setLang]);
    return null;
  }

  it.each([
    ['ko', '데이터 신뢰 · 로직 버전 혼재', '잠정', '로직 버전 혼재', '원천 로직 버전', '지표 버전'],
    ['en', 'Data trust · Logic versions mixed', 'Provisional', 'Logic versions mixed', 'Source logic versions', 'Metric version'],
  ])('%s: displays mixed versions in server order after the provisional badge and metric row', (lang, name, provisional, mixed, source, metric) => {
    render(<I18nProvider>{lang === 'en' && <English />}<DataTrustIndicator trust={{ ...trust, provisional: true, metricVersion: '3', sourceLogicVersions: ['v1.3', 'v1.2'] }} assessments={[]} /></I18nProvider>);
    const button = screen.getByRole('button', { name });
    const badge = screen.getByText(mixed);
    expect(badge.previousElementSibling).toHaveTextContent(provisional);
    expect(badge).toHaveClass('bg-accent-warn-soft');
    expect(button.firstElementChild).toHaveClass('bg-accent-success');
    fireEvent.click(button);
    const row = screen.getByText(source);
    expect(row.nextElementSibling).toHaveTextContent('v1.3, v1.2');
    expect(row.previousElementSibling?.previousElementSibling).toHaveTextContent(metric);
  });

  it.each([
    [['v1.2'], true], [undefined, false], [[], false],
  ])('shows a detail row only for nonempty versions %s', (versions, hasRow) => {
    render(<I18nProvider><DataTrustIndicator trust={{ ...trust, sourceLogicVersions: versions }} assessments={[]} /></I18nProvider>);
    expect(screen.queryByText('로직 버전 혼재')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '데이터 신뢰' }));
    expect(!!screen.queryByText('원천 로직 버전')).toBe(hasRow);
    if (hasRow) expect(screen.getByText('원천 로직 버전').nextElementSibling).toHaveTextContent('v1.2');
  });

  it.each([false, true])('compact mixed signal survives hideProvisional=%s', hideProvisional => {
    render(<I18nProvider><DataTrustIndicator trust={{ ...trust, provisional: true, sourceLogicVersions: ['v1', 'v2'] }} assessments={[]} compact hideProvisional={hideProvisional} /></I18nProvider>);
    const button = screen.getByRole('button', { name: /로직 버전 혼재/ });
    expect(button).toHaveAttribute('title', expect.stringContaining(' · 로직 버전 혼재'));
    expect(button.firstElementChild).toHaveClass('bg-accent-warn');
    expect(!!screen.queryByText('로직 버전 혼재')).toBe(!hideProvisional);
    expect(!!screen.queryByText('잠정')).toBe(!hideProvisional);
  });

  it.each([
    ['ko', '데이터 신뢰', '로직 버전 혼재'],
    ['en', 'Data trust', 'Logic versions mixed'],
  ])('%s: the expanded mixed name carries the label and the mixed text; a non-mixed one stays the label', (lang, label, mixed) => {
    const withLang = (versions: string[]) => <I18nProvider>{lang === 'en' && <English />}<DataTrustIndicator trust={{ ...trust, sourceLogicVersions: versions }} assessments={[]} /></I18nProvider>;
    const view = render(withLang(['v1', 'v2']));
    expect(screen.getByRole('button', { name: `${label} · ${mixed}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
    view.rerender(withLang(['v1']));
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', label);
  });

  it('keeps the non-mixed compact name and tone', () => {
    render(<I18nProvider><DataTrustIndicator trust={trust} assessments={[]} compact /></I18nProvider>);
    const button = screen.getByRole('button', { name: '데이터 신뢰' });
    expect(button.firstElementChild).toHaveClass('bg-accent-success');
    expect(button.title).not.toContain('로직 버전 혼재');
  });

  it('keeps mixed badges in the wrapping button flow', () => {
    render(<I18nProvider><DataTrustIndicator trust={{ ...trust, provisional: true, sourceLogicVersions: ['v1', 'v2'] }} assessments={[]} wrap /></I18nProvider>);
    const button = screen.getByRole('button', { name: '데이터 신뢰 · 로직 버전 혼재' });
    expect(button).toHaveClass('flex-wrap', 'max-w-full');
    expect(screen.getByText('로직 버전 혼재').parentElement).toBe(button);
  });
});

describe('summary mode keeps the mixed-version signal (§18, #1166)', () => {
  function English() {
    const { setLang } = useI18n();
    useEffect(() => setLang('en'), [setLang]);
    return null;
  }
  it.each([
    ['ko', '데이터 신뢰', '이슈 없음', '로직 버전 혼재'],
    ['en', 'Data trust', 'No issues', 'Logic versions mixed'],
  ])('%s: clear assessments + mixed versions → warning dot, name and title carry the mixed text', (lang, label, short, mixed) => {
    const clear = [{ kind: 'coverage', state: 'clear', statusSource: 'fixture', observedAt: '2026-10-16T09:00:00' }] as never;
    render(<I18nProvider>{lang === 'en' && <English />}<DataTrustIndicator trust={{ ...trust, sourceLogicVersions: ['v1', 'v2'] }} assessments={clear} summary /></I18nProvider>);
    const button = screen.getByRole('button', { name: new RegExp(mixed) });
    expect(button.getAttribute('aria-label')).toContain(label);
    expect(button.getAttribute('aria-label')).not.toBe(`${label} · ${short} · ${lang === 'ko' ? '자세히' : 'Details'}`);
    expect(button).toHaveAttribute('title', expect.stringContaining(mixed));
    expect(button.firstElementChild).toHaveClass('bg-accent-warn');
    expect(button.querySelector('[data-trust-short]')).toHaveTextContent(short);
  });
  it('without mixed versions the summary keeps the success dot and the plain name', () => {
    render(<I18nProvider><DataTrustIndicator trust={trust} assessments={[]} summary /></I18nProvider>);
    const button = screen.getByRole('button', { name: '데이터 신뢰 · 이슈 없음 · 자세히' });
    expect(button.firstElementChild).toHaveClass('bg-accent-success');
  });
});

describe('probe', () => {
  it('is hidden, unfocusable, not announced, and ignores summary', () => {
    const ref = (node: HTMLElement | null) => { void node; };
    const { container } = render(<I18nProvider><DataTrustIndicator trust={{ ...trust, provisional: true }} assessments={[]} summary probe={ref} /></I18nProvider>);
    expect(container.querySelector('button')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    const probeEl = container.querySelector('[data-trust-probe]')!;
    expect(probeEl.textContent).toBe(''); // no text nodes: nothing else on the page matches it twice
    expect([...probeEl.querySelectorAll('[data-text]')].map(n => n.getAttribute('data-text')).join('|')).toBe('확인된 이슈 없음|·|커버리지 98.0%|·|갱신 10-16 09:00|잠정');
  });
});

describe('DataTrustIndicator showWithoutTrust (#1769)', () => {
  const unknown = [{ kind: 'coverage', state: 'unknown', reason: 'check_failed' }] as const;
  it('renders nothing for a null trust by default', () => {
    const { container } = render(<I18nProvider><DataTrustIndicator trust={null} assessments={[...unknown]} /></I18nProvider>);
    expect(container.textContent).toBe('');
  });
  it('shows assessments only, without update time, coverage or final status', () => {
    render(<I18nProvider><DataTrustIndicator trust={null} assessments={[...unknown]} showWithoutTrust /></I18nProvider>);
    const text = details().textContent ?? '';
    expect(text).toContain('응답에 Trust 없음');
    expect(text).not.toMatch(/커버리지|갱신/);
    fireEvent.click(screen.getByRole('button', { name: '데이터 신뢰' }));
    expect(screen.getByText(/갱신 시각·커버리지·확정 여부를 알 수 없습니다/)).toBeTruthy();
    expect(screen.queryByText('확정')).toBeNull();
    expect(screen.getByText('미확인')).toBeTruthy();
  });
  it('keeps the null-Trust claims out of summary wrap, compact and probe forms', () => {
    for (const form of [{ summary: true, wrap: true }, { compact: true }] as const) {
      const { container, unmount } = render(<I18nProvider><DataTrustIndicator trust={null} assessments={[...unknown]} showWithoutTrust {...form} /></I18nProvider>);
      const button = screen.getByRole('button', { name: /데이터 신뢰/ });
      expect(button.getAttribute('title')).toContain('응답에 Trust 없음');
      expect(button.getAttribute('title')).not.toMatch(/커버리지|갱신/);
      expect(container.textContent).not.toMatch(/잠정|확정|로직 버전 혼재/);
      unmount();
    }
    let node: HTMLElement | null = null;
    const { container } = render(<I18nProvider><DataTrustIndicator trust={null} assessments={[...unknown]} showWithoutTrust probe={n => { node = n ?? node; }} /></I18nProvider>);
    expect(node).not.toBeNull();
    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
    const words = [...container.querySelectorAll('[data-text]')].map(e => e.getAttribute('data-text')).join(' ');
    expect(words).toContain('응답에 Trust 없음');
    expect(words).not.toMatch(/커버리지|갱신/);
  });
  it('still renders nothing when there are no assessment items', () => {
    const { container } = render(<I18nProvider><DataTrustIndicator trust={null} assessments={[]} showWithoutTrust /></I18nProvider>);
    expect(container.textContent).toBe('');
  });
});
