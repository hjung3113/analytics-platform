import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '../i18n';
import { memoryStorage } from '../testing';

// The app ships `<html lang="ko">`; a reload with English restored must update it (#1139, #1104b UX U-1).
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  document.documentElement.lang = 'ko';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const { lang, setLang } = useI18n();
  return <button type="button" onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}>{lang}</button>;
}

describe('document lang (mock fallback, #1139)', () => {
  it('reaches documentElement on mount when a reload restores English without a user toggle', () => {
    localStorage.setItem('platform:lang', 'en');
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByRole('button').textContent).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('follows a language change without duplicating the setLang write', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(document.documentElement.lang).toBe('ko');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('platform:lang')).toBe('en');
  });
});
