import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatText, I18nProvider, useI18n, useMessages } from '../i18n';
import { memoryStorage } from '../testing';

// #2174: a package's own message table is read in the current language, placeholders filled the same way as `t`.
const MESSAGES = {
  more: { ko: '조건 {count}개 더', en: '{count} more' },
  plain: { ko: '적용', en: 'Apply' },
};

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const m = useMessages(MESSAGES);
  const { lang, setLang } = useI18n();
  return <button type="button" onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}>{`${m('more', { count: 3 })}|${m('plain')}`}</button>;
}

describe('useMessages / formatText (#2174)', () => {
  it('reads the table in the current language and follows a language change', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByRole('button').textContent).toBe('조건 3개 더|적용');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('3 more|Apply');
  });

  it('fills placeholders and leaves an unknown name as written', () => {
    expect(formatText(MESSAGES.more, 'en', { count: 0 })).toBe('0 more');
    expect(formatText(MESSAGES.more, 'ko')).toBe('조건 {count}개 더');
  });
});
