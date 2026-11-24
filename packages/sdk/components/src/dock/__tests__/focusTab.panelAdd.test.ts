import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusTabSoon, keepFocusAfterPanelAdd } from '../focusTab';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

const KEY = 'next-analysis-panel:bars/equipment';

/** A workspace whose toolbar renders a standalone dock before the workspace's own dock (#2734 review C4). */
function mount() {
  document.body.innerHTML = `<div id="root" data-panel-workspace data-workspace-mode="fit">
    <div data-workspace-actions><div data-dock-layout id="toolbar-dock"><div role="tab" data-tab-panel-id="receiver" tabindex="0" id="toolbar-tab"></div></div></div>
    <div data-workspace-dock><div data-dock-layout id="dock">
      <div role="tab" data-tab-panel-id="bars" tabindex="0"></div>
      <div data-dock-panel="bars" id="host"><button id="decoy">새 패널</button><div id="row"><button id="trigger" data-focus-key="${KEY}">새 패널</button></div></div>
    </div></div>
    <button id="outside">밖</button>
  </div>`;
  const get = (id: string) => document.getElementById(id)!;
  return { get, root: get('root'), trigger: get('trigger') };
}

const rebuildRow = (get: (id: string) => HTMLElement) => {
  get('row').innerHTML = `<button id="rebuilt" data-focus-key="${KEY}">새 패널</button>`;
};

const addTab = (get: (id: string) => HTMLElement) => {
  get('dock').insertAdjacentHTML('afterbegin', '<div role="tab" data-tab-panel-id="receiver" tabindex="0" id="receiver-tab"></div>');
};

describe('keepFocusAfterPanelAdd (#2734)', () => {
  it('finds the rebuilt trigger by its focus key, not an earlier button with the same text', () => {
    vi.useFakeTimers();
    const { get, trigger } = mount();
    trigger.focus();
    keepFocusAfterPanelAdd(trigger, 'receiver');
    rebuildRow(get);
    vi.advanceTimersByTime(40);
    expect(document.activeElement).toBe(get('rebuilt'));
  });

  it('moves to the added tab in the workspace dock, not a toolbar dock, when the trigger is covered', () => {
    vi.useFakeTimers();
    const { get, trigger } = mount();
    trigger.focus();
    keepFocusAfterPanelAdd(trigger, 'receiver');
    addTab(get);
    get('host').setAttribute('inert', '');
    vi.advanceTimersByTime(40);
    expect(document.activeElement).toBe(get('receiver-tab'));
  });

  it('stops watching once the user moves focus elsewhere, even if that focus later falls to the document', () => {
    vi.useFakeTimers();
    const { get, trigger } = mount();
    trigger.focus();
    keepFocusAfterPanelAdd(trigger, 'receiver');
    get('outside').focus();
    get('outside').remove();
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(700);
    expect(document.activeElement).toBe(document.body);
  });

  it('stops watching on a pointer press', () => {
    vi.useFakeTimers();
    const { trigger } = mount();
    trigger.focus();
    keepFocusAfterPanelAdd(trigger, 'receiver');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    trigger.blur();
    vi.advanceTimersByTime(700);
    expect(document.activeElement).toBe(document.body);
  });
});

it('focusTabSoon looks in the workspace dock, not a toolbar dock rendered first (#2734 review C4)', () => {
  vi.useFakeTimers();
  const { get, root } = mount();
  addTab(get);
  focusTabSoon(() => root, 'receiver');
  vi.advanceTimersByTime(5);
  expect(document.activeElement).toBe(get('receiver-tab'));
});
