import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAppHost } from '@ap/app-host';
import type { PlatformAdapter } from '@ap/contracts';
import { testSession } from '@ap/kernel/testing';
import { createAssembly, type Assembly } from '#platform-assembly';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { declarations, registry } from './menus';
import { spaceSystems, type SpaceSystems } from './space-systems';
import { SpaceSystemsSession } from './space-systems-session';
import { makeAppSlots } from './slots';

/** The shell's sidebar draws the feature block (VOC · Task · 설문) of the space it sits in once the app's link store answers; completion must reach it with no navigation (#1289 node j). */
/** The mock assembly's answer (ADR-0009: tests reach `src/dev/**` only through the assembly). */
const MOCK_SPACE_SYSTEMS: SpaceSystems = await ((await createAssembly({ registry })) as Assembly).spaceSystems!();

/** What `main.tsx` injects into the Host, with the other slots empty as this test mounts only the features slot. */
const useAppSlots = makeAppSlots({ notifications: undefined as never, vocCompose: undefined as never, homeTodo: undefined as never, scopeControl: undefined as never, navCounts: undefined as never, spaceNavSection: undefined as never });

/** The Host owns its React root, so each mount's container is removed by hand (the Host exposes no unmount). */
const containers: HTMLElement[] = [];

async function mountAt(url: string, spaceSystemsSource: Assembly['spaceSystems']) {
  const mock = await createAssembly({ registry }) as Assembly;
  const session = testSession(['platform:view', 'features:access', 'analytics:view', 'equipment:view'], { user: { id: 'feature-user', name: 'feature-user', title: { ko: '기능', en: 'Feature' } } });
  const adapter: PlatformAdapter = { ...mock.adapter, session: () => session };
  const assembly: Assembly = { ...mock, adapter, spaceSystems: spaceSystemsSource };
  window.history.replaceState(null, '', url);
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  await act(async () => {
    await startAppHost({
      container,
      declarations,
      createAssembly: () => assembly,
      basePath: '/',
      equipmentAxes: EQUIPMENT_AXES,
      queryHistory: undefined as never,
      slots: useAppSlots,
      children: (mounted) => <SpaceSystemsSession source={mounted.spaceSystems ?? null} />,
    });
  });
  return container;
}

const featureBlock = () => screen.queryByRole('navigation', { name: /^기능 · / });

beforeEach(() => { spaceSystems.reset(); });
afterEach(() => { cleanup(); for (const container of containers.splice(0)) container.remove(); spaceSystems.reset(); window.history.replaceState(null, '', '/'); });

describe('the mounted app root (#1289 node j)', () => {
  it('draws the sidebar feature block when the link store answers, with no navigation in between', async () => {
    let answer!: (data: SpaceSystems) => void;
    await mountAt('/mars/equipment-master', () => new Promise<SpaceSystems>((resolve) => { answer = resolve; }));
    await screen.findAllByRole('navigation', {}, { timeout: 10_000 });
    expect(featureBlock()).toBeNull();
    await act(async () => { answer(MOCK_SPACE_SYSTEMS); });
    await waitFor(() => expect(featureBlock()).not.toBeNull(), { timeout: 10_000 });
    const task = within(featureBlock()!).getByRole('link', { name: /^Task/ });
    expect(task.getAttribute('href')).toContain(`managedSystem=${MOCK_SPACE_SYSTEMS.links[0]!.managedSystemId}`);
  }, 30_000);

  it('draws no block for a space whose link is disconnected', async () => {
    await mountAt('/mars/equipment-master', async () => ({ ...MOCK_SPACE_SYSTEMS, links: MOCK_SPACE_SYSTEMS.links.map((link) => ({ ...link, declared: false })) }));
    await screen.findAllByRole('navigation', {}, { timeout: 10_000 });
    await waitFor(() => expect(spaceSystems.getSnapshot().status).toBe('ready'));
    expect(featureBlock()).toBeNull();
  }, 30_000);
});
