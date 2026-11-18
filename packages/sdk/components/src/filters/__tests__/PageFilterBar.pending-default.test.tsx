import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { PageFilterBar } from '../../index';

const policy = vi.hoisted(() => ({ autoApplyingDefault: false as boolean | undefined }));
vi.mock('@ap/kernel/host', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/kernel/host')>(),
  useHostPlatformOptional: () => ({ queryPolicy: { ready: true, idle: true, drillGap: false, missing: [], autoApplyingDefault: policy.autoApplyingDefault } }),
}));
afterEach(cleanup);

const draw = () => render(<I18nProvider><PageFilterBar mode="draft" collapsible defaultCollapsed={false} preferenceKey="pending-default" summaryItems={[]} label="페이지 조건" fields={[
  { kind: 'select', key: 'mode', label: '비교 모드', value: 'a', options: [{ value: 'a', label: 'A' }], onValueChange: vi.fn() },
  { kind: 'search', key: 'q', label: '검색', value: '', onValueChange: vi.fn() },
]} /></I18nProvider>);

// #2515: during the first-entry automatic decision the arriving applied address resets the draft, so an edit here would vanish silently.
describe('PageFilterBar while the first-entry automatic default is pending (#2515)', () => {
  it('locks its fields until the decision ends', () => {
    policy.autoApplyingDefault = true;
    draw();
    const bar = screen.getByTestId('page-filter-bar');
    expect(bar).toBeDisabled();
    expect(bar).toHaveAttribute('aria-busy', 'true');
    // Pointer-opened controls (Radix Select) ignore a disabled fieldset; inert blocks them in the browser.
    expect(bar).toHaveAttribute('inert');
    expect(screen.getByRole('searchbox', { name: '검색' })).toBeDisabled();
  });
  it('stays editable once nothing is pending', () => {
    policy.autoApplyingDefault = undefined;
    draw();
    expect(screen.getByTestId('page-filter-bar')).not.toBeDisabled();
    expect(screen.getByTestId('page-filter-bar')).not.toHaveAttribute('inert');
    expect(screen.getByRole('searchbox', { name: '검색' })).not.toBeDisabled();
  });
});
