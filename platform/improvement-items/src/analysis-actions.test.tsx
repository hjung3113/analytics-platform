import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { I18nProvider, type AnalysisActionsProps } from '@ap/kernel';
import { ImprovementAnalysisActions } from './analysis-actions';

const platform = vi.hoisted(() => ({ resolveLink: vi.fn(), navigate: vi.fn(), can: vi.fn(() => true) }));
vi.mock('@ap/kernel', async importOriginal => ({ ...await importOriginal<typeof import('@ap/kernel')>(), usePlatform: () => platform }));
afterEach(() => { cleanup(); vi.clearAllMocks(); platform.can.mockReturnValue(true); });
const props: AnalysisActionsProps = { menuId: 'equipment-master', global: { ...emptyGlobal, scopeId: 'MEM', selection: ['EQ-1'] }, page: { focus: 'EQ-1', tab: 'validity', filter: ['status:in:active', 'kind:in:photo'], returnTo: '/old-screen' } };

describe('improvement analysis overflow entry (#1408)', () => {
  it('resolves and navigates with separate source page and destination create control', () => {
    platform.resolveLink.mockReturnValue({ allowed: true, href: '/improvement-items?focus=new&origin=equipment-master', droppedPageKeys: [] });
    render(<I18nProvider><ImprovementAnalysisActions {...props} /></I18nProvider>);
    expect(platform.resolveLink).toHaveBeenCalledWith('improvement-items', { global: props.global, page: { focus: 'new', origin: 'equipment-master', originPage: JSON.stringify({ focus: 'EQ-1', tab: 'validity', filter: ['status:in:active', 'kind:in:photo'] }) } });
    const button = screen.getByRole('button', { name: '개선 아이템 남기기' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(platform.navigate).toHaveBeenCalledWith('/improvement-items?focus=new&origin=equipment-master');
  });
  it('retains a disabled row and its accessible reason when resolution refuses the destination', () => {
    platform.resolveLink.mockReturnValue({ allowed: false, href: '/improvement-items?focus=new', droppedPageKeys: [] });
    render(<I18nProvider><ImprovementAnalysisActions {...props} /></I18nProvider>);
    const button = screen.getByRole('button', { name: '개선 아이템 남기기' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('개선 아이템을 열 권한이 없습니다.');
    fireEvent.click(button);
    expect(platform.navigate).not.toHaveBeenCalled();
  });
  it('is disabled for a reader without improvement:manage even when the menu opens', () => {
    platform.can.mockReturnValue(false);
    platform.resolveLink.mockReturnValue({ allowed: true, href: '/improvement-items?focus=new', droppedPageKeys: [] });
    render(<I18nProvider><ImprovementAnalysisActions {...props} /></I18nProvider>);
    const button = screen.getByRole('button', { name: '개선 아이템 남기기' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(platform.navigate).not.toHaveBeenCalled();
  });
});
