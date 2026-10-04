import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { I18nProvider } from '@ap/kernel';
import { DetailDrawer } from './DetailDrawer';
import { SegmentedRadio } from './RadioGroup';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Radios() {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
  return <SegmentedRadio
    label="Grain"
    value={value}
    onChange={setValue}
    options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]}
  />;
}

describe('SegmentedRadio', () => {
  it('moves selection and DOM focus with arrows, Home, and End', () => {
    render(<Radios />);
    const a = screen.getByRole('radio', { name: 'A' });
    const b = screen.getByRole('radio', { name: 'B' });
    const c = screen.getByRole('radio', { name: 'C' });
    expect(a).toHaveAttribute('aria-checked', 'true');
    expect(a).toHaveAttribute('tabindex', '0');
    expect(b).toHaveAttribute('tabindex', '-1');
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(b).toHaveAttribute('aria-checked', 'true');
    expect(b).toHaveAttribute('tabindex', '0');
    expect(a).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: 'ArrowDown' });
    expect(c).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'ArrowLeft' });
    expect(b).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: 'End' });
    expect(c).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'Home' });
    expect(a).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(a);
  });
});

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
function DrawerHost({ deepLink = false, removeTrigger = false }: { deepLink?: boolean; removeTrigger?: boolean }) {
  const [open, setOpen] = useState(deepLink);
  return <I18nProvider><DetailPanelSlotProvider>
    <div id="root"><main id="platform-main" tabIndex={-1}>
      {!removeTrigger && <button onClick={() => setOpen(true)}>open</button>}
      <button>behind</button>
      {open && <DetailDrawer title="Detail" onClose={() => setOpen(false)} headerActions={<a href="/detail">전체 화면</a>}
        tabs={[{ id: 'a', label: 'Attributes', content: <button>inside</button> }]} />}
    </main></div><SlotHost />
  </DetailPanelSlotProvider></I18nProvider>;
}

describe('DetailDrawer docked slot', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1440);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: window.innerWidth >= 1440, media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    }));
  });
  it.each([1280, 1440])('moves focus in, keeps the page usable, and closes via Esc with focus return (%spx)', width => {
    vi.stubGlobal('innerWidth', width);
    render(<DrawerHost />);
    const trigger = screen.getByRole('button', { name: 'open' });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: '상세 닫기' });
    expect(close).toHaveFocus();
    const dialog = screen.getByRole('dialog', { name: 'Detail' });
    expect(screen.getByRole('complementary', { name: '상세 패널' })).toContainElement(dialog);
    expect(screen.getByRole('main')).not.toContainElement(dialog);
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('drawer-scrim')).toBeNull();
    expect(dialog).not.toHaveClass('fixed');
    expect(screen.getByRole('link', { name: '전체 화면' })).toHaveAttribute('href', '/detail');
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus(); // No synthetic focus wrapping; native Tab can leave the panel.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    const inside = screen.getByRole('button', { name: 'inside' });
    inside.focus();
    expect(inside).toHaveFocus();
    fireEvent.keyDown(inside, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('restores deep-link content and falls back to main when no opener exists', () => {
    render(<DrawerHost deepLink />);
    expect(screen.getByRole('button', { name: '상세 닫기' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('falls back to main when the opener was removed', () => {
    const view = render(<DrawerHost />);
    const trigger = screen.getByRole('button', { name: 'open' });
    trigger.focus();
    fireEvent.click(trigger);
    view.rerender(<DrawerHost removeTrigger />);
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('does not steal focus after the user returns to the list', () => {
    render(<DrawerHost deepLink />);
    const behind = screen.getByRole('button', { name: 'behind' });
    behind.focus();
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    expect(behind).toHaveFocus();
  });
});
