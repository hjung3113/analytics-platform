import { describe, expect, it } from 'vitest';
import { routeParamNames } from '@ap/kernel';
import { manifests } from './index';

describe('manifest board support (docs/16 §6)', () => {
  it('lets the catalog sit in a board pane: declared, listed in navigation, no route parameter', () => {
    const catalog = manifests.find(menu => menu.id === 'metric-catalog')!;
    expect(catalog.features.board).toBe(true);
    expect(catalog.navHidden).toBeFalsy();
    expect(routeParamNames(catalog.path)).toEqual([]);
  });

  it('keeps the parameterised detail out of the board', () => {
    expect(manifests.find(menu => menu.id === 'metric-detail')!.features.board).not.toBe(true);
  });
});
