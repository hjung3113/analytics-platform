import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RichEditorImpl from '../RichEditorImpl';
import { Button } from '../../components/Button';
import { ToolbarRow } from '../toolbar/ToolbarRow';

async function mount() {
  let editor: Editor | null = null;
  const rendered = render(<RichEditorImpl surface="voc-description" ariaLabel="본문" toolbarStickyOffset={48} toolbar={(live, api) => { editor = live; return api.renderControls?.(); }} />);
  await screen.findByRole('textbox', { name: '본문' });
  await waitFor(() => expect(editor).not.toBeNull());
  return { ...rendered, editor: editor!, toolbar: screen.getByRole('toolbar', { name: '본문 서식' }) };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('variant A toolbar', () => {
  it('keeps exactly two rows under one toolbar and roves across the row break with one Tab stop', async () => {
    const { toolbar } = await mount();
    const rows = toolbar.querySelectorAll('[data-toolbar-row]');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass('flex-nowrap');
    const last = within(rows[0] as HTMLElement).getByRole('button', { name: '다시 실행' });
    const first = within(rows[1] as HTMLElement).getByRole('button', { name: '글머리 목록' });
    // Disabled undo/redo are skipped in the roving order.
    const bold = within(toolbar).getByRole('button', { name: '굵게' });
    act(() => bold.focus());
    fireEvent.keyDown(bold, { key: 'End' });
    expect(first).not.toHaveFocus();
    const undo = within(rows[0] as HTMLElement).getByRole('button', { name: '실행 취소' });
    // Walk from the last enabled control of row 1 to the first control of row 2.
    const enabled = [...rows[0]!.querySelectorAll<HTMLButtonElement>('[data-toolbar-visible="true"] button:not(:disabled)')];
    act(() => enabled.at(-1)!.focus());
    fireEvent.keyDown(enabled.at(-1)!, { key: 'ArrowRight' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Home' });
    expect(within(toolbar).getByRole('button', { name: '본문 스타일' })).toHaveFocus();
    expect([...toolbar.querySelectorAll('button')].filter(button => button.tabIndex === 0)).toHaveLength(1);
    expect(last).toBeDisabled();
    expect(undo).toBeDisabled();
  });
  it('reflects the current heading and radio selection', async () => {
    const { editor } = await mount();
    act(() => { editor.commands.setHeading({ level: 2 }); });
    const trigger = screen.getByRole('button', { name: '본문 스타일' });
    expect(trigger).toHaveTextContent('제목 2');
    expect(trigger).toHaveClass('min-w-20');
    await userEvent.click(trigger);
    expect(screen.getByRole('menuitemradio', { name: '제목 2' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: '본문' }));
    expect(editor.isActive('paragraph')).toBe(true);
  });
  it.each([['표', 'table'], ['인용', 'blockquote'], ['코드 블록', 'codeBlock'], ['체크리스트', 'taskList'], ['접기', 'details'], ['목차', 'tableOfContents']])('inserts %s with one click', async (label, node) => {
    const { editor, toolbar } = await mount();
    await userEvent.click(within(toolbar).getByRole('button', { name: label }));
    expect(JSON.stringify(editor.getJSON())).toContain(`"type":"${node}"`);
  });
  it('shows pressed styles and receives its sticky offset from the host', async () => {
    const { toolbar } = await mount();
    const bold = within(toolbar).getByRole('button', { name: '굵게' });
    await userEvent.click(bold);
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    expect(bold).toHaveClass('bg-surface-raised', 'border-border-subtle');
    await userEvent.click(bold);
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    expect(bold).not.toHaveClass('bg-surface-raised');
    expect(toolbar).toHaveClass('sticky');
    expect(toolbar.style.getPropertyValue('--rich-editor-toolbar-offset')).toBe('48px');
  });
  it('folds row tails in order, preserves pressed/disabled items, and restores them when widened', async () => {
    const resizes: ResizeObserverCallback[] = [];
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resizes.push(callback); } observe() {} disconnect() {} });
    let width = 140;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: this.hasAttribute('data-toolbar-row') ? width : 28, height: 28, x: 0, y: 0, top: 0, bottom: 28, left: 0, right: width, toJSON() {} };
    });
    const { editor, toolbar } = await mount();
    act(() => { editor.commands.toggleBlockquote(); });
    const rows = toolbar.querySelectorAll('[data-toolbar-row]');
    expect(rows).toHaveLength(2);
    await userEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: '더보기' }));
    const labels = screen.getAllByRole('menuitemcheckbox').map(item => item.textContent);
    expect(labels).toEqual(['인용', '코드 블록', '구분선', '표', '접기', '목차']);
    expect(screen.getByRole('menuitem', { name: '첨부 파일 추가' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: '인용' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await userEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: '더보기' }));
    expect(screen.getByRole('menuitem', { name: '다시 실행' })).toHaveAttribute('data-disabled');
    await userEvent.click(screen.getByRole('menuitem', { name: '링크' }));
    const linkInput = await screen.findByRole('textbox', { name: '링크 주소' });
    await waitFor(() => expect(linkInput).toHaveFocus());
    fireEvent.keyDown(linkInput, { key: 'Escape' });
    await waitFor(() => expect(within(rows[0] as HTMLElement).getByRole('button', { name: '더보기' })).toHaveFocus());
    width = 1200;
    act(() => resizes.forEach(resize => resize([], {} as ResizeObserver)));
    expect(within(toolbar).queryByRole('button', { name: '더보기' })).toBeNull();
    expect(within(toolbar).getByRole('button', { name: '목차' })).toBeVisible();
    vi.unstubAllGlobals();
  });
  it.each([['본문 스타일', 'menuitemradio', '제목 2'], ['형광펜', 'menuitem', '주의'], ['글자색', 'menuitem', '위험']] as const)('opens the folded %s popup from its visible menu anchor', async (label, role, choice) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: this.hasAttribute('data-toolbar-row') ? 28 : 28, height: 28, x: 0, y: 0, top: 0, bottom: 28, left: 0, right: 28, toJSON() {} };
    });
    const { editor, toolbar } = await mount();
    const row = toolbar.querySelector('[data-toolbar-row="1"]') as HTMLElement;
    const more = within(row).getByRole('button', { name: '더보기' });
    await userEvent.click(more);
    const trigger = screen.getByRole('menuitem', { name: label });
    await userEvent.click(trigger);
    const item = await screen.findByRole(role, { name: choice });
    expect(trigger.closest('[inert]')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(item, { key: 'Escape' });
    await waitFor(() => expect(more).toHaveFocus());
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: label }));
    await userEvent.click(await screen.findByRole(role, { name: choice }));
    await waitFor(() => {
      if (label === '본문 스타일') expect(editor.isActive('heading', { level: 2 })).toBe(true);
      else expect(editor.getAttributes(label === '형광펜' ? 'highlight' : 'textStyle').color).toBe(label === '형광펜' ? 'warning' : 'danger');
      expect(editor.view.dom).toHaveFocus();
    });
  });
  it('opens the folded attachment picker only after the menu closes and restores focus', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: this.hasAttribute('data-toolbar-row') ? 140 : 28, height: 28, x: 0, y: 0, top: 0, bottom: 28, left: 0, right: 140, toJSON() {} };
    });
    const { toolbar } = await mount();
    const more = within(toolbar.querySelector('[data-toolbar-row="2"]') as HTMLElement).getByRole('button', { name: '더보기' });
    const input = screen.getByTestId('rich-toolbar-attach-input');
    const pick = vi.spyOn(input, 'click').mockImplementation(() => {
      expect(screen.queryByRole('menu')).toBeNull();
      expect(more).toHaveFocus();
    });
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: '첨부 파일 추가' }));
    await waitFor(() => expect(pick).toHaveBeenCalledOnce());
  });
  it('retains validation and a visible more-button anchor for a folded link', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: this.hasAttribute('data-toolbar-row') ? 140 : 28, height: 28, x: 0, y: 0, top: 0, bottom: 28, left: 0, right: 140, toJSON() {} };
    });
    const { toolbar } = await mount();
    const more = within(toolbar.querySelector('[data-toolbar-row="1"]') as HTMLElement).getByRole('button', { name: '더보기' });
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: '링크' }));
    const input = await screen.findByRole('textbox', { name: '링크 주소' });
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.type(input, 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent('http:// 또는 https://');
    await userEvent.type(input, 'x');
    expect(input).not.toHaveAttribute('aria-invalid');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(more).toHaveFocus());
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: '링크' }));
    expect(await screen.findByRole('textbox', { name: '링크 주소' })).not.toHaveAttribute('aria-invalid');
  });
  it('folds only the last control one pixel below the full width including group margins', async () => {
    const resizes: ResizeObserverCallback[] = [];
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resizes.push(callback); } observe() {} disconnect() {} });
    let width = 112; // 3 × 28px controls + 2 × 4px gaps + 4px group margin + 16px row padding.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: this.hasAttribute('data-toolbar-row') ? width : this.hasAttribute('data-toolbar-control') ? 28 : 16, height: 28, x: 0, y: 0, top: 0, bottom: 28, left: 0, right: width, toJSON() {} };
    });
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      const style = computed(element);
      return new Proxy(style, { get: (target, key) => {
        if (key === 'marginLeft' && element.classList.contains('ml-1')) return '4px';
        if (element.hasAttribute('data-toolbar-row')) {
          if (key === 'columnGap') return '4px';
          if (key === 'paddingLeft' || key === 'paddingRight') return '8px';
        }
        return Reflect.get(target, key);
      } });
    });
    const { container } = render(<ToolbarRow row={1} controls={['first', 'second', 'last'].map((id, index) => ({ id, group: index === 0 ? 0 : 1, control: <Button>{id}</Button>, overflow: id }))} />);
    const controls = [...container.querySelectorAll('[data-toolbar-control]')];
    expect(controls.map(control => control.getAttribute('data-toolbar-visible'))).toEqual(['true', 'true', 'true']);
    width = 111;
    act(() => resizes.forEach(resize => resize([], {} as ResizeObserver)));
    expect(controls.map(control => control.getAttribute('data-toolbar-visible'))).toEqual(['true', 'true', 'false']);
    expect(screen.getByRole('button', { name: '더보기' })).toBeVisible();
    width = 112;
    act(() => resizes.forEach(resize => resize([], {} as ResizeObserver)));
    expect(controls.map(control => control.getAttribute('data-toolbar-visible'))).toEqual(['true', 'true', 'true']);
  });
  it('takes a folded group-start control out of the row layout so the more button stays in place', () => {
    const widths = [40, 40, 40];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute('data-toolbar-control');
      const width = id ? widths[['first', 'second', 'last'].indexOf(id)]! : this.hasAttribute('data-toolbar-row') ? 100 : 28;
      return { width, height: 28, top: 0, left: 0, right: width, bottom: 28, x: 0, y: 0, toJSON: () => ({}) };
    });
    const { container } = render(<ToolbarRow row={1} controls={['first', 'second', 'last'].map((id, index) => ({ id, group: index, control: <Button aria-label={id}>{id}</Button>, overflow: null }))} />);
    const folded = container.querySelector('[data-toolbar-control="last"]');
    expect(folded).toHaveAttribute('data-toolbar-visible', 'false');
    expect(folded).toHaveClass('absolute');
    expect(folded).not.toHaveClass('relative');
    vi.restoreAllMocks();
  });
});
