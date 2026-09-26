import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { DetailDrawer } from './DetailDrawer';
import { SegmentedRadio } from './RadioGroup';

afterEach(cleanup);

function mockWidth(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes('1440'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

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

function DrawerHost({ onClose, title = 'Detail' }: { onClose: () => void; title?: string }) {
  return <I18nProvider>
    <div id="root">
      <button type="button">behind</button>
      <DetailDrawer title={title} onClose={onClose} tabs={[{ id: 'a', label: 'Attributes', content: <button type="button">inside</button> }]} />
    </div>
  </I18nProvider>;
}

describe('DetailDrawer breakpoint', () => {
  it('below 1440 is modal: scrim, inert app, Escape on document, Tab wraps', () => {
    mockWidth(false);
    const onClose = vi.fn();
    render(<DrawerHost onClose={onClose} />);
    const root = document.getElementById('root')!;
    expect(root.hasAttribute('inert')).toBe(true);
    expect(screen.getByTestId('drawer-scrim')).toBeInTheDocument();
    const close = screen.getByRole('button', { name: '상세 닫기' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'behind' }));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('at 1440 or wider stays non-modal and ignores document Escape', () => {
    mockWidth(true);
    const onClose = vi.fn();
    render(<DrawerHost onClose={onClose} title="Wide" />);
    const root = document.getElementById('root')!;
    expect(root.hasAttribute('inert')).toBe(false);
    expect(screen.queryByTestId('drawer-scrim')).toBeNull();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
