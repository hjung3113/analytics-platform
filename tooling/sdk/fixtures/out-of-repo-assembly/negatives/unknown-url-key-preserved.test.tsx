// Negative check fixture — unknown-url-key-preserved: a URL key the platform does not know survives an in-page
// navigation inside the fixture app (URL contract: unregistered keys stay in extras, never dropped).
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { afterEach, expect, it } from 'vitest';
import { lazy } from 'react';
import { Gauge } from 'lucide-react';
import { setRole } from '@ap/mock-server';
import { AppRoot, buildRegistry } from '@ap/app-host';
import { contextCapabilities, groupId } from '@ap/contracts';
import { I18nProvider, pathFor, usePlatform, type MenuEntry } from '@ap/kernel';
import { declarations, KIT_AXES } from '../../menus';
import { createAssembly } from '../../mock/assembly';
import { inMemoryQueryHistory } from '../start';


function ProbePage() {
  const { setPage } = usePlatform();
  return <button type="button" data-testid="negatives-set-page" onClick={() => setPage({ fixturePage: '2' })}>set page</button>;
}

// jsdom elements have no scrollTo; the kernel scrolls the main element on navigation (well-known DOM shape jsdom omits).
if (typeof Element.prototype.scrollTo !== 'function') {
  const proto = Element.prototype as unknown as { scrollTo: (x?: number, y?: number) => void };
  proto.scrollTo = () => {};
}

const FIXTURE_MENU: MenuEntry = {
  id: 'negatives-page', group: groupId('kit'), primary: false, label: { ko: '부정 시험', en: 'negatives' },
  description: { ko: '', en: '' }, path: '/negatives', icon: Gauge, permission: 'platform:view', requiresScope: false,
  context: contextCapabilities(), pageType: 'overview',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['fixturePage'],
  component: lazy(() => Promise.resolve({ default: ProbePage })),
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  setRole('engineer');
  window.history.replaceState(null, '', '/');
});

it('unknown-url-key-preserved: zzFuture survives a page-key navigation', async () => {
  setRole('viewer');
  const menu = buildRegistry({ ...declarations, menus: [...declarations.menus, FIXTURE_MENU] }).menus
    .find((entry) => entry.id === 'negatives-page');
  if (menu === undefined) throw new Error('the fixture menu did not register');
  window.history.replaceState(null, '', `${pathFor(menu)}?zzFuture=keep-me`);
  const registry = buildRegistry({ ...declarations, menus: [...declarations.menus, FIXTURE_MENU] });
  // Render the public Host root through Testing Library so cleanup owns its unmount.
  render(<I18nProvider><AppRoot registry={registry} assembly={createAssembly({ registry })}
    equipmentAxes={KIT_AXES} queryHistory={inMemoryQueryHistory()} location={undefined} slots={{}} /></I18nProvider>);
  fireEvent.click(await screen.findByTestId('negatives-set-page', undefined, { timeout: 5000 }));
  await waitFor(() => expect(window.location.search).toContain('fixturePage=2'));
  expect(window.location.search, 'an unknown URL key must survive the navigation').toContain('zzFuture=keep-me');
});
