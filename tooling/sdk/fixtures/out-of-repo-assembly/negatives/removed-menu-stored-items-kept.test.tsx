// Negative check fixture — removed-menu-stored-items-kept: when the assembly drops a menu, that menu's stored items
// (recent visits) are neither deleted nor thrown (host-entry-contract §7, pinned).
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { setRole } from '@ap/mock-server';
import { AppRoot, buildRegistry } from '@ap/app-host';
import { I18nProvider } from '@ap/kernel';
import { declarations, KIT_AXES } from '../../menus';
import { MENU_ID, MENU_LABEL, MENU_PATH } from '../../menus/sample/menu';
import { createAssembly } from '../../mock/assembly';
import { inMemoryQueryHistory } from '../start';


// Node 26 runs the test process without --localstorage-file and jsdom here gives no localStorage either; the platform
// reads preferences through `localStorage` with a memory-only fallback, so the fixture installs a real Storage first.
function installLocalStorage(): Storage {
  const entries = new Map<string, string>();
  const shim: Storage = {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: (key) => (entries.has(key) ? entries.get(key)! : null),
    setItem: (key, value) => { entries.set(String(key), String(value)); },
    removeItem: (key) => { entries.delete(key); },
    key: (index) => [...entries.keys()][index] ?? null,
  };
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
  return shim;
}
const storage = installLocalStorage();
// jsdom omits the element scroll API used when the shell navigates.
if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => {};

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  storage.clear();
  setRole('engineer');
  window.history.replaceState(null, '', '/');
});

it('removed-menu-stored-items-kept: the removed menu’s recent visit stays in storage', async () => {
  setRole('viewer');
  storage.setItem('platform:recent:viewer', JSON.stringify([
    { menuId: 'kit-inhouse-work', url: '/kit/kit-inhouse-work', at: 1 },
  ]));
  const withoutInHouseMenu = { ...declarations, menus: declarations.menus.filter((menu) => menu.id !== 'kit-inhouse-work') };
  const registry = buildRegistry(withoutInHouseMenu);
  // A menu without a screen is a place to look at, not one to come back to, so its visit is not recorded (#1944). The visit
  // that persists is therefore the kit's sample menu, which has a screen.
  window.history.replaceState(null, '', MENU_PATH);
  // Render the public Host root through Testing Library so cleanup owns its unmount.
  render(<I18nProvider><AppRoot registry={registry} assembly={createAssembly({ registry })}
    equipmentAxes={KIT_AXES} queryHistory={inMemoryQueryHistory()} location={undefined} slots={{}} /></I18nProvider>);
  expect((await screen.findAllByText(MENU_LABEL.ko)).length).toBeGreaterThan(0);
  await waitFor(() => expect(storage.getItem('platform:recent:viewer')).toContain(MENU_ID));
  const stored = JSON.parse(storage.getItem('platform:recent:viewer') ?? '[]') as unknown[];
  expect(stored, 'the removed menu’s stored item must be kept after the public menu visit is persisted').toContainEqual({
    menuId: 'kit-inhouse-work', url: '/kit/kit-inhouse-work', at: 1,
  });
});
