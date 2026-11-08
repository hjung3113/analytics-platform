import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { PageFilterBar } from '../PageFilterBar';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('consumer-declared initial filter collapse (#1473)', () => {
  it.each([undefined, false, true])('uses defaultCollapsed=%s only when no preference exists', defaultCollapsed => {
    vi.stubGlobal('localStorage', memoryStorage());
    render(<I18nProvider><PageFilterBar collapsible defaultCollapsed={defaultCollapsed} label="조회 조건" preferenceKey="initial-test" fields={[]} summaryItems={[]} /></I18nProvider>);
    expect(screen.getByRole('button', { name: defaultCollapsed ? '조회 조건 펼치기' : '조회 조건 접기' })).toHaveAttribute('aria-expanded', String(!defaultCollapsed));
  });
  it('respects the person’s saved expanded preference over the consumer default', () => {
    const storage = memoryStorage(); storage.setItem('platform:page-filter-collapsed:initial-test', 'false'); vi.stubGlobal('localStorage', storage);
    render(<I18nProvider><PageFilterBar collapsible defaultCollapsed label="조회 조건" preferenceKey="initial-test" fields={[]} summaryItems={[]} /></I18nProvider>);
    expect(screen.getByRole('button', { name: '조회 조건 접기' })).toHaveAttribute('aria-expanded', 'true');
  });
});
