import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { I18nProvider } from '@ap/kernel';
import { DetailDrawer } from './DetailDrawer';
import { SegmentedRadio } from './RadioGroup';

afterEach(cleanup);

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

  it('reports each keyboard move once, also while the arrow key repeats (#228 review)', async () => {
    const calls: string[] = [];
    function Recorded() {
      const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
      return <SegmentedRadio label="Grain" value={value} onChange={next => { calls.push(next); setValue(next); }}
        options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} />;
    }
    render(<Recorded />);
    const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 10)));
    const a = screen.getByRole('radio', { name: 'A' });
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    await wait();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'B' }), { key: 'ArrowRight', repeat: true });
    fireEvent.keyUp(screen.getByRole('radio', { name: 'C' }), { key: 'ArrowRight' });
    await wait();
    expect(calls).toEqual(['b', 'c']);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'C' }));
  });

  it('is a horizontal radiogroup and activates the already selected option without a change', () => {
    const onChange = vi.fn();
    const onActivate = vi.fn();
    render(<SegmentedRadio label="Grain" value="a" onChange={onChange} onActivate={onActivate}
      options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
    expect(screen.getByRole('radiogroup', { name: 'Grain' })).toHaveAttribute('aria-orientation', 'horizontal');
    fireEvent.click(screen.getByRole('radio', { name: 'A' }));
    expect(onActivate).toHaveBeenCalledWith('a');
    expect(onChange).not.toHaveBeenCalled();
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
  // Viewport geometry is covered by the 1280/1440 E2E contract, not JSDOM.
  it('moves focus in, keeps the page usable, and closes via Esc with focus return', () => {
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

  it('keeps the panel open when an inner control consumes Escape', () => {
    const onClose = vi.fn();
    render(<I18nProvider><DetailPanelSlotProvider>
      <DetailDrawer title="Detail" onClose={onClose} tabs={[{
        id: 'a', label: 'Attributes', content: <button onKeyDown={e => { if (e.key === 'Escape') e.preventDefault(); }}>inner control</button>,
      }]} /><SlotHost />
    </DetailPanelSlotProvider></I18nProvider>);
    const inner = screen.getByRole('button', { name: 'inner control' });
    inner.focus();
    fireEvent.keyDown(inner, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Detail' })).toBeInTheDocument();
    expect(inner).toHaveFocus();
  });

  it('keeps drawer tabs on the shared FeedbackOps look with active state via data-state', () => {
    render(<I18nProvider><DetailPanelSlotProvider>
      <DetailDrawer title="Detail" onClose={() => {}} tabs={[
        { id: 'a', label: 'Attributes', content: 'attributes' }, { id: 'audit', label: 'Audit', content: 'audit' },
      ]} /><SlotHost />
    </DetailPanelSlotProvider></I18nProvider>);
    const list = screen.getByRole('tablist');
    // ADR-0023 C2: the drawer no longer restyles TabsList (was bg-surface-sunken + text-text-secondary).
    expect(list).not.toHaveClass('bg-surface-sunken', 'text-text-secondary');
    expect(screen.getByRole('tab', { name: 'Audit' })).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByRole('tab', { name: 'Attributes' })).toHaveAttribute('data-state', 'active');
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
