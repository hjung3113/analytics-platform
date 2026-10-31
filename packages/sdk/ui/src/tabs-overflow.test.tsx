import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './index';

const VALUES = ['a', 'b', 'c', 'd', 'e'];
const LABELS: Record<string, string> = { a: '개요', b: '추이', c: '분포', d: '분해 막대', e: '상관' };
let wrapperWidth = 0;
const observers: Array<() => void> = [];

beforeEach(() => {
  wrapperWidth = 0;
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { observers.push(cb); } observe() {} disconnect() {} unobserve() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    let width = 0;
    if (this.getAttribute('role') === 'tab') width = 100;
    else if (this.tagName === 'SPAN' && this.className.includes('inline-flex gap-1')) width = 80;
    else if (this.tagName === 'DIV' && this.getAttribute('role') !== 'tablist' && this.querySelector(':scope > [role="tablist"]') !== null) width = wrapperWidth;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function resizeTo(width: number) { wrapperWidth = width; act(() => { observers.forEach(cb => cb()); }); }
function tree(props: { overflow?: 'menu' | 'scroll'; value?: string; onValueChange?: (v: string) => void; disabled?: string } = {}) {
  const root = props.value === undefined ? { defaultValue: 'a' } : { value: props.value, onValueChange: props.onValueChange };
  return (
    <Tabs {...root}>
      <TabsList aria-label="종류" overflow={props.overflow ?? 'menu'} moreLabel="더보기">
        {VALUES.map(v => <TabsTrigger key={v} value={v} disabled={v === props.disabled}>{LABELS[v]}</TabsTrigger>)}
      </TabsList>
      {VALUES.map(v => <TabsContent key={v} value={v}>{LABELS[v]} 내용</TabsContent>)}
    </Tabs>
  );
}
const visibleTabs = () => screen.getAllByRole('tab').map(t => t.textContent!.replace(/\s/g, ''));
const tabByLabel = (label: string) => screen.getAllByRole('tab', { hidden: true }).find(t => t.textContent!.replace(/\s/g, '').startsWith(label.replace(/\s/g, '')))!;
const moreButton = () => screen.queryByRole('button', { name: /^더보기/ });

it('hides nothing and renders no menu button while every tab fits', () => {
  render(tree());
  resizeTo(600);
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(moreButton()).toBeNull();
});

it('hides nothing when widths are unavailable (jsdom zero widths)', () => {
  render(tree());
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(moreButton()).toBeNull();
  expect(screen.getByRole('tablist').closest('[class*="overflow"]')).not.toBeNull();
});

it('puts the tabs that do not fit behind a trailing 더보기 button', () => {
  render(tree());
  resizeTo(400);
  // 400 - 80 (button) → 3 tabs of 100
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  const button = moreButton()!;
  expect(button).not.toBeNull();
  expect(button.getAttribute('data-selected')).toBeNull();
  expect(button.getAttribute('tabindex')).toBe('-1');
  expect(screen.getByRole('tablist').getAttribute('tabindex')).not.toBe('-1');
});

it('brings every tab back when the list grows again', () => {
  render(tree());
  resizeTo(400);
  expect(moreButton()).not.toBeNull();
  resizeTo(700);
  expect(moreButton()).toBeNull();
  expect(screen.getAllByRole('tab')).toHaveLength(5);
});

it('does not rerender endlessly: a second identical resize changes nothing', () => {
  let renders = 0;
  function Probe() { renders += 1; return <TabsTrigger value="a">개요</TabsTrigger>; }
  render(<Tabs defaultValue="a"><TabsList overflow="menu" aria-label="종류"><Probe /><TabsTrigger value="b">추이</TabsTrigger></TabsList></Tabs>);
  resizeTo(150);
  const after = renders;
  resizeTo(150);
  expect(renders).toBe(after);
});

it('walks ArrowRight over visible tabs, then the 더보기 button, and Home/End jump', () => {
  render(tree());
  resizeTo(400);
  const tabs = screen.getAllByRole('tab');
  const button = moreButton()!;
  act(() => tabs[0]!.focus());
  fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(tabs[1]);
  fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' });
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(button);
  fireEvent.keyDown(button, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(button);
  fireEvent.keyDown(button, { key: 'Home' });
  expect(document.activeElement).toBe(tabs[0]);
  fireEvent.keyDown(tabs[0]!, { key: 'End' });
  expect(document.activeElement).toBe(button);
  fireEvent.keyDown(button, { key: 'ArrowLeft' });
  expect(document.activeElement).toBe(tabs[2]);
});

it('leaves arrow keys to Radix when nothing is hidden', async () => {
  render(tree());
  resizeTo(600);
  const tabs = screen.getAllByRole('tab');
  act(() => tabs[4]!.focus());
  fireEvent.keyDown(tabs[4]!, { key: 'ArrowRight' });
  await waitFor(() => expect(document.activeElement).toBe(tabs[0]));
});

it('never lets arrows reach a hidden tab', () => {
  render(tree());
  resizeTo(400);
  const hiddenTab = screen.getAllByRole('tab', { hidden: true }).find(t => t.hidden)!;
  expect(hiddenTab).toBeDefined();
  const visible = screen.getAllByRole('tab');
  act(() => visible[2]!.focus());
  fireEvent.keyDown(visible[2]!, { key: 'ArrowRight' });
  expect(document.activeElement).not.toBe(hiddenTab);
  expect(document.activeElement).toBe(moreButton());
});

it.each([
  ['uncontrolled', undefined],
  ['controlled', 'a'],
])('selects a hidden tab from the menu in a %s Tabs and shows its name with the selection mark', async (_name, controlled) => {
  function Controlled() {
    const [value, setValue] = React.useState('a');
    return tree({ value, onValueChange: setValue });
  }
  render(controlled === undefined ? tree() : <Controlled />);
  resizeTo(400);
  const button = moreButton()!;
  fireEvent.keyDown(button, { key: 'ArrowDown' });
  const item = await screen.findByRole('menuitemradio', { name: '분해 막대' });
  expect(screen.getAllByRole('menuitemradio').map(i => i.textContent)).toEqual(['분해 막대', '상관']);
  fireEvent.click(item);
  const tab = tabByLabel('분해 막대');
  expect(tab.getAttribute('aria-selected')).toBe('true');
  const selectedButton = await screen.findByRole('button', { name: '더보기: 분해 막대' });
  expect(selectedButton.getAttribute('data-selected')).toBe('');
  expect(selectedButton.textContent).toContain('분해 막대');
  expect(selectedButton.getAttribute('tabindex')).toBe('0');
  expect(screen.getByRole('tablist').getAttribute('tabindex')).toBe('-1');
});

it('keeps the panel labelled by a hidden selected tab', () => {
  render(tree());
  resizeTo(400);
  fireEvent.mouseDown(tabByLabel('상관'), { button: 0 });
  const panel = screen.getByRole('tabpanel');
  const labelledBy = panel.getAttribute('aria-labelledby')!;
  const owner = document.getElementById(labelledBy)!;
  expect(owner).not.toBeNull();
  expect(owner.hidden).toBe(true);
  expect(owner.getAttribute('role')).toBe('tab');
});

it('marks disabled hidden tabs as disabled menu items and skips them', async () => {
  render(tree({ disabled: 'e' }));
  resizeTo(400);
  fireEvent.keyDown(moreButton()!, { key: 'ArrowDown' });
  const item = await screen.findByRole('menuitemradio', { name: '상관' });
  expect(item.getAttribute('aria-disabled')).toBe('true');
});

it('default overflow renders no wrapper and no menu button', () => {
  render(tree({ overflow: 'scroll' }));
  resizeTo(400);
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(moreButton()).toBeNull();
  const list = screen.getByRole('tablist');
  expect(list.parentElement?.querySelector('button[aria-haspopup="menu"]')).toBeNull();
  expect(list.parentElement?.getAttribute('role')).toBeNull();
  expect(list.parentElement?.contains(list)).toBe(true);
  expect(list.parentElement?.hasAttribute('data-orientation')).toBe(true);
  expect(list.parentElement?.querySelector(':scope > [role="tablist"]')).toBe(list);
  expect(list.classList.contains('overflow-x-auto')).toBe(true);
});

it('F1: a hidden selected tab leaves the 더보기 button as the only Tab stop, and the stop returns when it is visible again', () => {
  function Ctl({ value }: { value: string }) { return tree({ value, onValueChange: () => {} }); }
  const { rerender } = render(<Ctl value="a" />);
  resizeTo(400);
  const visible = screen.getAllByRole('tab');
  act(() => visible[1]!.focus());
  rerender(<Ctl value="e" />);
  const row = () => screen.getByRole('tablist').parentElement!;
  const stops = () => Array.from(row().querySelectorAll<HTMLElement>('[tabindex="0"]'));
  expect(stops()).toEqual([moreButton()]);
  expect(screen.getAllByRole('tab').every(t => t.getAttribute('tabindex') === '-1')).toBe(true);
  expect(tabByLabel('상관').getAttribute('aria-selected')).toBe('true');
  rerender(<Ctl value="a" />);
  expect(stops()).toHaveLength(1);
  expect(stops()[0]!.getAttribute('role')).toBe('tab');
});

it('F2: a hidden tab whose label shrinks returns to the row', () => {
  const base = (HTMLElement.prototype.getBoundingClientRect as unknown as { getMockImplementation(): (this: HTMLElement) => DOMRect }).getMockImplementation();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('role') === 'tab' && this.textContent!.startsWith('짧')) return { ...base.call(this), width: 40 } as DOMRect;
    return base.call(this);
  });
  function Short({ d }: { d: string }) {
    return (
      <Tabs defaultValue="a">
        <TabsList aria-label="종류" overflow="menu">
          {['a', 'b', 'c'].map(v => <TabsTrigger key={v} value={v}>{LABELS[v]}</TabsTrigger>)}
          <TabsTrigger value="d">{d}</TabsTrigger>
          <TabsTrigger value="e">상관</TabsTrigger>
        </TabsList>
      </Tabs>
    );
  }
  const { rerender } = render(<Short d="분해 막대" />);
  resizeTo(450);
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  rerender(<Short d="짧" />);
  act(() => observers.forEach(cb => cb()));
  expect(moreButton()).toBeNull();
  expect(screen.getAllByRole('tab')).toHaveLength(5);
});
