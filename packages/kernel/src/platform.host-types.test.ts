import { describe, expect, expectTypeOf, it } from 'vitest';
import type { HostPlatform, MenuPlatform } from './platform';
import { useHostPlatform, usePlatform } from './platform';
import * as root from './index';
import * as host from './host';

// ADR-0076: one runtime value, two types. A menu sees MenuPlatform; the shell, components and app see HostPlatform.
describe('MenuPlatform and HostPlatform (ADR-0076)', () => {
  it('keeps host-only fields off usePlatform() and on useHostPlatform()', () => {
    expectTypeOf(usePlatform).returns.toEqualTypeOf<MenuPlatform>();
    expectTypeOf(useHostPlatform).returns.toEqualTypeOf<HostPlatform>();
    expectTypeOf<MenuPlatform>().toExtend<Pick<HostPlatform, keyof MenuPlatform>>();
    expectTypeOf<HostPlatform>().toHaveProperty('paletteOpen');
    // @ts-expect-error paletteOpen is a shell-only field, not on the menu surface
    expectTypeOf<MenuPlatform>().toHaveProperty('paletteOpen');
    // @ts-expect-error the shell-only visible menu list is not on the menu surface
    type Hidden = MenuPlatform['visibleMenus'];
    expectTypeOf<keyof MenuPlatform>().not.toEqualTypeOf<keyof HostPlatform>();
    void (null as unknown as Hidden);
  });

  it('publishes the shell-only symbols on the host entry only', () => {
    for (const name of ['useHostPlatform', 'PaneScreenProvider', 'PaneQueryDraftProvider', 'useModuleHost', 'withPaneContext', 'paneHref', 'useQueryHistory', 'useAdapterRequest', 'BOARD_PATH', 'hasDotSegment']) {
      expect(host, name).toHaveProperty(name);
      expect(root, name).not.toHaveProperty(name);
    }
    expect(root).toHaveProperty('usePlatform');
    expect(root).toHaveProperty('PlatformProvider');
  });
});
