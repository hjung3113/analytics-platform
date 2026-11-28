import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { groupId, type MenuView, type PlatformAdapter } from '@ap/contracts';
import { SavedViewPreview, useHostPlatform } from '../../host';
import { createRegistry, I18nProvider, PlatformProvider } from '../../index';
import { testAdapter, testMenu, testSavedView, testSpace } from '../../testing';

const view = testSavedView({ id: 'original', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: null }) as MenuView;
const adapter = testAdapter();
const space = testSpace();
const menu = testMenu();
const registry = createRegistry({ spaces: [space], groups: [{ id: groupId('overview'), space: space.id, label: menu.label, icon: menu.icon }], menus: [menu] });

function Preview({ copy = view, href = '/', readOnly = false, port = adapter, children }: {
  copy?: MenuView; href?: string; readOnly?: boolean; port?: PlatformAdapter; children: React.ReactNode;
}) {
  return <I18nProvider><PlatformProvider registry={registry} adapter={port}>
    <SavedViewPreview view={copy} href={href} {...(readOnly ? { readOnly: true } : {})}>{children}</SavedViewPreview>
  </PlatformProvider></I18nProvider>;
}

afterEach(cleanup);

it.each([
  ['id', { ...view, id: 'replacement' }, '/'],
  ['version', { ...view, version: view.version + 1 }, '/'],
  ['href', view, '/?v=1'],
] as const)('replaces the preview content and address when %s changes', (_key, copy, href) => {
  function Body() {
    const { url } = useHostPlatform();
    return <><p>{url}</p><label>Local draft<input /></label></>;
  }
  const { rerender } = render(<Preview><Body /></Preview>);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'old copy state' } });
  rerender(<Preview copy={copy} href={href}><Body /></Preview>);
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByText(href)).toBeVisible();
});

it('keeps the content readable and blocks edit controls and links in read-only mode', () => {
  const edit = vi.fn();
  const navigate = vi.fn((event: React.MouseEvent) => event.preventDefault());
  render(<Preview readOnly><h2>Reviewable conditions</h2><button onClick={edit}>Edit</button>
    <a href="/another" onClick={navigate}>Go</a></Preview>);
  expect(screen.getByRole('heading', { name: 'Reviewable conditions' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.click(screen.getByRole('link', { name: 'Go' }));
  expect(edit).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it('refuses programmatic platform writes from the read-only preview', async () => {
  const menuAction = vi.fn(adapter.menuAction);
  let previewAdapter = adapter;
  function Body() { previewAdapter = useHostPlatform().adapter; return null; }
  render(<Preview readOnly port={testAdapter({ menuAction })}><Body /></Preview>);
  const result = await previewAdapter.menuAction({ action: 'fixture.write', input: {}, context: {}, idempotencyKey: 'fixture' });
  expect(result.outcome).toBe('forbidden');
  expect(menuAction).not.toHaveBeenCalled();
});
