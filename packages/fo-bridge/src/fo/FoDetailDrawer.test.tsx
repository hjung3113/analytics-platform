import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { FoDetailDrawer } from './FoDetailDrawer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

const parts = { title: '제목', subtitle: '부제', headerActions: <button type="button">링크 복사</button>, body: <p>본문</p> };

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

/** `@testing-library/react` is not a dependency of this package: mount with react-dom directly. */
function mount(onClose: () => void, requestClose?: () => void) {
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  roots.push(root);
  act(() => root.render(
    <I18nProvider><DetailPanelSlotProvider>
      <FoDetailDrawer parts={parts} onClose={onClose} {...(requestClose !== undefined ? { requestClose } : {})} />
      <SlotHost />
    </DetailPanelSlotProvider></I18nProvider>,
  ));
  const aside = document.querySelector('aside[aria-label="상세 패널"]')!;
  return { aside, close: () => act(() => (aside.querySelector('button[aria-label="상세 닫기"]') as HTMLButtonElement).click()) };
}

describe('FoDetailDrawer', () => {
  it('shows the parts in the slot, the body inside .fo-detail-body with no tab row for its one 상세 tab', () => {
    const { aside } = mount(vi.fn());
    const dialog = aside.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('제목');
    expect(dialog.textContent).toContain('부제');
    expect(dialog.textContent).toContain('링크 복사');
    // One tab draws no tab row (06 §13, #886 UX-8).
    expect(dialog.querySelector('[role="tablist"]')).toBeNull();
    const body = [...dialog.querySelectorAll('p')].find(p => p.textContent === '본문');
    expect(body?.closest('.fo-detail-body')).toBeTruthy();
  });

  it('closes through onClose when the detail has no requestClose', () => {
    const onClose = vi.fn();
    mount(onClose).close();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes through requestClose, not onClose, when the detail asks first', () => {
    const onClose = vi.fn();
    const requestClose = vi.fn();
    mount(onClose, requestClose).close();
    expect(requestClose).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
