import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MAX_GROUP_ID_LENGTH, MAX_GROUP_MEMBERS } from '@ap/contracts';
import { I18nProvider } from '@ap/kernel';
import { ColumnGroupChooseView } from '../ColumnGroupEditor';

afterEach(cleanup);
it('explains the member limit beside the count and describes an unavailable column', () => {
  const members = Array.from({ length: MAX_GROUP_MEMBERS }, (_, n) => `c${n}`);
  const editor = {
    draft: { kind: 'choose' as const, name: 'Group', members }, note: '', setNote: vi.fn(),
    start: vi.fn(), edit: vi.fn(), rename: vi.fn(), cancel: vi.fn(), setName: vi.fn(), toggle: vi.fn(),
  };
  render(<I18nProvider><ColumnGroupChooseView editor={editor} columns={[
    { id: 'extra', label: 'Extra', hidden: false },
    { id: 'x'.repeat(MAX_GROUP_ID_LENGTH + 1), label: 'Long', hidden: false },
  ]} idPrefix="caps" onSave={vi.fn()} onCancel={vi.fn()} /></I18nProvider>);
  expect(screen.getByText(`한 묶음에 최대 ${MAX_GROUP_MEMBERS}열`)).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Extra 선택' })).toBeDisabled();
  expect(screen.getByText('묶을 수 없는 열')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Long 선택' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Long 선택' })).toHaveAccessibleDescription('묶을 수 없는 열');
});
