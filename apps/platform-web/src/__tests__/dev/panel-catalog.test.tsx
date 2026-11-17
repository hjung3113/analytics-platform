import { stubCompactTableGeometry } from '@ap/components/testing';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { createAssembly, type Assembly } from '#platform-assembly';
import { EQUIPMENT_AXES } from '../../equipmentAxes';
import { registry } from '../../menus';

let restoreGeometry: () => void;
beforeEach(() => {
  restoreGeometry = stubCompactTableGeometry(1200);
  // Virtual rows have their own height; jsdom otherwise measures each row as the whole page.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.hasAttribute('data-index') ? 32 : 800; } });
});
afterEach(() => { cleanup(); restoreGeometry(); });
describe('dev panel catalog (#2433)', () => {
  it('renders the real registry and filters rows by reading or writing key', async () => {
    const assembly = await createAssembly({ registry }) as Assembly;
    render(<I18nProvider><PlatformProvider equipmentAxes={EQUIPMENT_AXES} registry={registry} adapter={assembly.adapter}>{assembly.topBarTools}</PlatformProvider></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: '패널 카탈로그' }));
    const dialog = screen.getByRole('dialog');
    const panels = registry.menus.flatMap(menu => registry.panels(menu.id));
    expect(panels.length).toBeGreaterThan(11);
    for (const panel of panels) expect(await within(dialog).findByText(`${panel.menuId}/${panel.id}`)).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('textbox', { name: '키 필터' }), { target: { value: 'verdict' } });
    const filtered = panels.filter(panel => registry.panelsReading('verdict').includes(panel) || registry.panelsWriting('verdict').includes(panel));
    // Lookup objects are stable, so the catalog and reverse indexes describe the same registrations.
    await waitFor(() => {
      for (const panel of panels) expect(within(dialog).queryAllByText(`${panel.menuId}/${panel.id}`).length > 0).toBe(filtered.includes(panel));
    });
    expect(within(dialog).getByRole('columnheader', { name: '이 키를 쓰는 패널' })).toBeTruthy();
    expect(within(dialog).getByRole('columnheader', { name: '이 키를 읽는 패널' })).toBeTruthy();
  });
});
