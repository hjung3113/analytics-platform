import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SlidersHorizontal, Target } from 'lucide-react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { I18nProvider } from '@ap/kernel';
import { DetailDrawer, Field } from './DetailDrawer';
import { Inspector } from './inspector/Inspector';
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

/** #353: controlled tabs that start on the unknown-tab fallback; the recovery button swaps the parent
 * to the attributes tab and removes the invalid tab in the same commit, unmounting the button. */
function RecoveryDrawerHost({ title = 'Detail', initialTab = 'invalid', audit = true }: { title?: string; initialTab?: string; audit?: boolean }) {
  const [tab, setTab] = useState(initialTab);
  const [unknown, setUnknown] = useState(true);
  return <I18nProvider><DetailPanelSlotProvider>
    <div id="root"><main id="platform-main" tabIndex={-1}>
      <button>behind</button>
      <DetailDrawer title={title} onClose={() => {}} tab={tab} onTabChange={setTab}
        tabs={[
          { id: 'attributes', label: 'Attributes', content: <button>속성 내용</button> },
          // A second real tab keeps the tab row after the unknown tab goes (one tab draws no row, #886 UX-8).
          ...(audit ? [{ id: 'audit', label: 'Audit', content: <button>감사 내용</button> }] : []),
          ...(unknown ? [{ id: 'invalid', label: '알 수 없는 탭', content: (
            <p role="alert">등록되지 않은 탭입니다. <button onClick={() => { setTab('attributes'); setUnknown(false); }}>속성 열기</button></p>
          ) }] : []),
        ]} />
    </main></div><SlotHost />
  </DetailPanelSlotProvider></I18nProvider>;
}

/** #353 FIX1: two real tabs, both with a control; the parent-controlled tab value changes from outside
 * the panel (history Back path) while the tab list itself stays, so only the focused control unmounts
 * — and Radix Presence drops the inactive content one commit after the value change. */
function TwoTabDrawerHost({ tab }: { tab: string }) {
  return <I18nProvider><DetailPanelSlotProvider>
    <div id="root"><main id="platform-main" tabIndex={-1}>
      <button>behind</button>
      <DetailDrawer title="Detail" onClose={() => {}} tab={tab} onTabChange={() => {}}
        tabs={[
          { id: 'attributes', label: 'Attributes', content: <button>속성 내용</button> },
          { id: 'validity', label: 'Validity', content: <button>유효구간 내용</button> },
        ]} />
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

  it('uses platform tabs with active state via data-state without consumer restyling', () => {
    render(<I18nProvider><DetailPanelSlotProvider>
      <DetailDrawer title="Detail" onClose={() => {}} tabs={[
        { id: 'a', label: 'Attributes', content: 'attributes' }, { id: 'audit', label: 'Audit', content: 'audit' },
      ]} /><SlotHost />
    </DetailPanelSlotProvider></I18nProvider>);
    const list = screen.getByRole('tablist');
    // ADR-0023 개정(#340): @ap/ui가 선택 표식을 정의하며 드로어는 모양을 덮어쓰지 않는다.
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

  // B-12: a label longer than the fixed 9rem column (e.g. averageOfQuantilesAllowed, 171px) must wrap,
  // not overlap the value column; the track widths themselves stay unchanged.
  it('wraps long Field labels inside the fixed label column', () => {
    render(<I18nProvider><DetailPanelSlotProvider>
      <DetailDrawer title="Detail" onClose={() => {}} tabs={[{ id: 'a', label: 'Attributes', content: (
        <dl>
          <Field label="averageOfQuantilesAllowed">p95 · 3.2s</Field>
        </dl>
      ) }]} /><SlotHost />
    </DetailPanelSlotProvider></I18nProvider>);
    const row = screen.getByText('averageOfQuantilesAllowed').closest('div');
    expect(row).toHaveClass('grid-cols-[9rem_1fr]'); // column width unchanged
    expect(screen.getByText('averageOfQuantilesAllowed')).toHaveClass('min-w-0', 'break-words');
  });

  // FIX1 (review): camelCase keys fold at word boundaries instead of dropping a single trailing
  // character; <wbr> adds no text, so textContent and the accessible name stay unchanged.
  it('offers fold points at camelCase word boundaries without changing the label text', () => {
    render(<I18nProvider><DetailPanelSlotProvider>
      <DetailDrawer title="Detail" onClose={() => {}} tabs={[{ id: 'a', label: 'Attributes', content: (
        <dl>
          <Field label="averageOfQuantilesAllowed">—</Field>
          <Field label="owed">false</Field>
          <Field label={<span>Coverage</span>}>12 rooms</Field>
        </dl>
      ) }]} /><SlotHost />
    </DetailPanelSlotProvider></I18nProvider>);
    const camel = screen.getByText('averageOfQuantilesAllowed');
    expect(camel.querySelectorAll('wbr')).toHaveLength(3); // average|Of|Quantiles|Allowed
    expect(camel.textContent).toBe('averageOfQuantilesAllowed');
    expect(screen.getByText('owed').querySelectorAll('wbr')).toHaveLength(0); // no case boundary
    expect(screen.getByText('Coverage').closest('dt')!.querySelectorAll('wbr')).toHaveLength(0); // ReactNode label
  });

  // #353: the focused recovery control unmounts with the tab switch; focus must land on the selected
  // tab trigger instead of falling to body (06 §26 keyboard floor).
  it('moves focus to the selected tab trigger when the focused control disappears with a tab switch', async () => {
    render(<RecoveryDrawerHost />);
    const recover = screen.getByRole('button', { name: '속성 열기' });
    recover.focus();
    expect(recover).toHaveFocus();
    fireEvent.click(recover);
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Attributes' })).toHaveFocus());
  });

  // #886 UX-8: when the tab switch leaves one tab, the tab row goes with it; focus falls back to the panel (06 §13).
  it('moves focus to the panel when the tab switch leaves a single tab and the row disappears', async () => {
    render(<RecoveryDrawerHost audit={false} />);
    const recover = screen.getByRole('button', { name: '속성 열기' });
    recover.focus();
    fireEvent.click(recover);
    expect(screen.queryByRole('tablist')).toBeNull();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Detail' })).toHaveFocus());
  });

  // #353 FIX1: history Back can change the controlled tab while the tab list itself stays; the focused
  // content control disappears a commit later (Radix Presence), and focus must land on the selected
  // tab trigger instead of staying on body (06 §13, §26).
  it('moves focus to the selected tab trigger when the tab value changes while the list stays', async () => {
    const view = render(<TwoTabDrawerHost tab="validity" />);
    const inner = screen.getByRole('button', { name: '유효구간 내용' });
    inner.focus();
    expect(inner).toHaveFocus();
    // Back-like path: only the parent-controlled value changes, from outside the panel.
    view.rerender(<TwoTabDrawerHost tab="attributes" />);
    // The restore runs in the MutationObserver microtask after Presence removes the inactive content,
    // not synchronously in the value-change commit.
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Attributes' })).toHaveFocus());
  });

  it('does not steal focus the user already moved outside the panel when tabs switch', () => {
    render(<RecoveryDrawerHost initialTab="attributes" />);
    const behind = screen.getByRole('button', { name: 'behind' });
    behind.focus();
    expect(behind).toHaveFocus();
    // Radix tabs activate on mousedown; the controlled value changes while focus stays outside.
    fireEvent.mouseDown(screen.getByRole('tab', { name: '알 수 없는 탭' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(behind).toHaveFocus();
  });

  it('does not move body focus on a re-render that switches no tab', () => {
    const view = render(<RecoveryDrawerHost title="First" initialTab="attributes" />);
    const inside = screen.getByRole('button', { name: '속성 내용' });
    inside.focus();
    // A click outside the panel leaves focus on body in jsdom only via an explicit blur.
    fireEvent.pointerDown(document.body);
    inside.blur();
    expect(document.activeElement).toBe(document.body);
    view.rerender(<RecoveryDrawerHost title="Second" initialTab="attributes" />);
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps focus on body after an outside pointerdown clears the panel, even when tabs then switch', async () => {
    render(<RecoveryDrawerHost />);
    const recover = screen.getByRole('button', { name: '속성 열기' });
    recover.focus();
    expect(recover).toHaveFocus();
    fireEvent.pointerDown(document.body);
    recover.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(recover); // same instance: tab value and tab list change together
    expect(screen.queryByRole('alert')).toBeNull();
    // Restoration is a MutationObserver microtask: yield so a restore that ignored the non-steal
    // guard would be observable here instead of the test passing before it runs.
    await act(() => new Promise(resolve => { setTimeout(resolve, 0); }));
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Inspector (APG accordion stack, rail with peek)', () => {
  const sections = [
    { id: 'target', title: { ko: '분석 대상', en: 'Target' }, icon: Target, summary: { ko: '선택 3', en: 'Selected 3' }, render: () => <p>target body</p> },
    { id: 'options', title: { ko: '옵션', en: 'Options' }, icon: SlidersHorizontal, render: () => <p>options body</p> },
  ];
  const label = { ko: '분석 보조', en: 'Analysis inspector' };

  it('stack: heading > button with aria-expanded/aria-controls, the content panel is not a landmark, clicks toggle', () => {
    render(<I18nProvider><Inspector sections={sections} form="stack" label={label} /></I18nProvider>);
    const button = screen.getByRole('button', { name: '분석 대상' });
    expect(screen.getByRole('heading', { level: 3, name: '분석 대상' })).toContainElement(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).not.toHaveAttribute('role');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toBeVisible();
    expect(button).toHaveAccessibleDescription('선택 3');
  });

  it('rail: Escape closes the peek and focus returns to the button that opened it', async () => {
    render(<I18nProvider><Inspector sections={sections} form="rail" label={label} /></I18nProvider>);
    const button = screen.getByRole('button', { name: '옵션' });
    button.focus();
    fireEvent.click(button);
    fireEvent.keyDown(await screen.findByText('options body'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('options body')).toBeNull());
    expect(document.activeElement).toBe(button);
  });
});
