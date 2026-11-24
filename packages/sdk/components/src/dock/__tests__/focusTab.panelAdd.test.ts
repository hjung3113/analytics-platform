import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusTabSoon, keepFocusAfterPanelAdd } from '../focusTab';

// Emptying the page first lets a pending watch see its workspace gone and remove its listeners before the next test.
afterEach(() => {
  document.body.innerHTML = '';
  if (vi.isFakeTimers()) vi.advanceTimersByTime(40);
  vi.useRealTimers();
});

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

const addTab = (get: (id: string) => HTMLElement, id = 'receiver') => {
  get('dock').insertAdjacentHTML('afterbegin', `<div role="tab" data-tab-panel-id="${id}" tabindex="0" id="${id}-tab"></div>`);
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

  it('looks for the rebuilt trigger only in its own dock panel, not a same-key button in another panel', () => {
    vi.useFakeTimers();
    const { get, trigger } = mount();
    get('dock').insertAdjacentHTML('beforeend', `<div data-dock-panel="other"><button id="elsewhere" data-focus-key="${KEY}">새 패널</button></div>`);
    get('dock').insertAdjacentHTML('beforeend', '<div data-dock-layout><div data-dock-panel="bars"><button id="nested" data-focus-key="' + KEY + '">새 패널</button></div></div>');
    trigger.focus();
    keepFocusAfterPanelAdd(trigger, 'receiver');
    rebuildRow(get);
    get('rebuilt').setAttribute('hidden', '');
    vi.advanceTimersByTime(40);
    expect(document.activeElement).toBe(document.body);
    get('rebuilt').removeAttribute('hidden');
    vi.advanceTimersByTime(40);
    expect(document.activeElement).toBe(get('rebuilt'));
  });

  it('lets the latest addition from the same trigger own the hand-off', () => {
    vi.useFakeTimers();
    const { get, trigger } = mount();
    trigger.focus();
    keepFocusAfterPanelAdd(trigger, 'receiver');
    addTab(get);
    vi.advanceTimersByTime(40);
    expect(document.activeElement).toBe(trigger);
    // The second addition is laid out after its first check, and the first watch's next check (60 ms) comes before the second's (70 ms).
    keepFocusAfterPanelAdd(trigger, 'second');
    vi.advanceTimersByTime(1);
    addTab(get, 'second');
    get('host').setAttribute('inert', '');
    vi.advanceTimersByTime(20);
    expect(document.activeElement).not.toBe(get('receiver-tab'));
    vi.advanceTimersByTime(10);
    expect(document.activeElement).toBe(get('second-tab'));
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
