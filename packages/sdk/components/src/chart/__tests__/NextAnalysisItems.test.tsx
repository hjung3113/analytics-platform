import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, type ObjectSelectionLink } from '@ap/kernel';
import { afterEach, expect, it, vi } from 'vitest';
import { NextAnalysisItems } from '../NextAnalysisItems';

const { navigate, objectSelectionLinks } = vi.hoisted(() => ({ navigate: vi.fn(), objectSelectionLinks: vi.fn() }));
vi.mock('@ap/kernel', async importOriginal => {
  const platform = {
    route: { menu: { id: 'source' } },
    canOpen: () => true,
    registry: { panels: () => [
      { id: 'matrix', outputs: [{ key: 'equipment', selection: { objectKind: 'equipment', dimension: 'equipment' } }] },
      { id: 'trend', outputs: [{ key: 'days', selection: { dimension: 'date', label: { ko: '날짜', en: 'Date' } } }] },
    ] },
    navigate, objectSelectionLinks,
  };
  return { ...await importOriginal<typeof import('@ap/kernel')>(),
    usePlatform: () => platform, usePlatformOptional: () => platform, useDrill: () => ({ depth: 0, levels: [] }) };
});
afterEach(cleanup);

it('disables oversized links and explains each drop the resolver reports without its values', async () => {
  const links: ObjectSelectionLink[] = [
    { kind: 'tooLong', menuId: 'long', label: { ko: '긴 주소', en: 'Long address' }, href: null, allowed: false, droppedPageKeys: [], droppedSelections: [] },
    { kind: 'link', menuId: 'allowed', label: { ko: '분석', en: 'Analysis' }, href: '/analysis', allowed: true, droppedPageKeys: [], droppedSelections: [
      { dimension: 'date', reason: 'noInbound' }, { dimension: 'equipment', reason: 'noInbound' }, { dimension: 'equipment', reason: 'ambiguous' },
      { dimension: 'date', reason: 'scope' }, { dimension: 'date', reason: 'length' },
    ] },
  ];
  objectSelectionLinks.mockReturnValue(links);
  const user = userEvent.setup();
  render(<I18nProvider><NextAnalysisItems output={{ panelId: 'matrix', key: 'equipment' }}
    selection={{ shape: 'set', values: ['EQ-01'] }} localActions={[]} renderRow={items => items} /></I18nProvider>);
  expect(objectSelectionLinks).toHaveBeenCalledWith({ kind: 'equipment', id: 'EQ-01' }, { returnTo: true, objectOutput: 'equipment' });
  await user.click(screen.getByRole('button', { name: '다른 분석' }));
  const long = screen.getByRole('menuitem', { name: '긴 주소' });
  expect(long).toHaveAttribute('aria-disabled', 'true');
  expect(long).toHaveAccessibleDescription('주소가 너무 길어 열 수 없습니다');
  await user.click(long);
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole('menuitem', { name: '분석' })).toHaveAccessibleDescription(
    '전달: EQ-01 · 날짜 선택은 이 화면이 받지 않습니다 · equipment 선택은 이 화면이 받지 않습니다 · equipment 선택이 여럿이라 넘기지 않습니다 · Scope가 달라 선택을 넘기지 않습니다 · 주소가 길어 날짜 선택을 뺐습니다',
  );
});

it('passes the selected object link proof to navigation', async () => {
  const proof = Object.freeze({});
  objectSelectionLinks.mockReturnValue([
    { kind: 'link', menuId: 'allowed', label: { ko: '분석', en: 'Analysis' }, href: '/analysis', allowed: true, droppedPageKeys: [], proof },
  ]);
  const user = userEvent.setup();
  render(<I18nProvider><NextAnalysisItems output={{ panelId: 'matrix', key: 'equipment' }}
    selection={{ shape: 'set', values: ['EQ-01'] }} localActions={[]} renderRow={items => items} /></I18nProvider>);
  await user.click(screen.getByRole('button', { name: '다른 분석' }));
  await user.click(screen.getByRole('menuitem', { name: '분석' }));
  expect(navigate).toHaveBeenLastCalledWith('/analysis', { focus: 'page', carryProof: proof });
});
