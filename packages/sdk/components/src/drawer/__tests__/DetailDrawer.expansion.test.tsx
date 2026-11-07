import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, DirtyConfirmation, Popover, PopoverContent, PopoverTrigger, useDetailPanelSlotHost } from '@ap/ui';
import { DetailDrawer } from '../DetailDrawer';

function Host() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} aria-label="slot" />; }
function Fixture() {
  const [open, setOpen] = useState(true); const [asking, setAsking] = useState(false);
  return <I18nProvider><DetailPanelSlotProvider><Host />{open && <DetailDrawer title="상세" onClose={() => setAsking(true)} footer={<button>저장</button>} tabs={[{ id: 'main', label: '상세', content: <>
    <textarea aria-label="입력" /><div contentEditable suppressContentEditableWarning aria-label="편집기" />
    <Popover><PopoverTrigger>선택</PopoverTrigger><PopoverContent><button>선택지</button></PopoverContent></Popover>
    <DirtyConfirmation open={asking} onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); setOpen(false); }} />
  </> }]} />}</DetailPanelSlotProvider></I18nProvider>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('preserves input/editor node identity, values, scroll and toggle focus; popup Escape precedes collapse and guarded close', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  render(<Fixture />);
  const input = screen.getByLabelText('입력'); const editor = screen.getByLabelText('편집기'); const scroll = screen.getByRole('region');
  fireEvent.change(input, { target: { value: '저장 전' } }); editor.textContent = '긴 편집 내용'; scroll.scrollTop = 120;
  const toggle = screen.getByRole('button', { name: '크게 보기' }); act(() => toggle.focus()); fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: '원래 크기로' })).toBe(toggle); expect(toggle).toHaveFocus();
  expect(screen.getByLabelText('입력')).toBe(input); expect(screen.getByLabelText('편집기')).toBe(editor);
  fireEvent.click(screen.getByRole('button', { name: '선택' }));
  fireEvent.keyDown(screen.getByRole('button', { name: '선택지' }), { key: 'Escape' });
  expect(screen.queryByRole('button', { name: '선택지' })).toBeNull(); expect(screen.getByRole('button', { name: '원래 크기로' })).toBe(toggle);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.getByRole('button', { name: '크게 보기' })).toBe(toggle); expect(toggle).toHaveFocus();
  expect(input).toHaveValue('저장 전'); expect(editor.textContent).toBe('긴 편집 내용'); expect(scroll.scrollTop).toBe(120);
  expect(screen.getByRole('button', { name: '저장' })).toBeTruthy();
  fireEvent.keyDown(input, { key: 'Escape' }); expect(await screen.findByRole('alertdialog', { name: '변경사항이 저장되지 않았습니다' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
  expect(input).toHaveValue('저장 전');
  fireEvent.click(screen.getByRole('button', { name: '크게 보기' }));
  fireEvent.click(screen.getByRole('button', { name: '상세 닫기' })); expect(await screen.findByRole('alertdialog', { name: '변경사항이 저장되지 않았습니다' })).toBeTruthy();
});
