import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { testSession } from '@ap/kernel/testing';
import type { PlatformAdapter } from '@ap/contracts';
import { createAssembly, type Assembly } from '#platform-assembly';
import { AppRoot } from './app-root';
import { featureSlot } from './feature-systems';
import { registry } from './menus';
import { spaceSystems, type SpaceSystems } from './space-systems';
import { appSlots } from './slots';

/** The shell's sidebar draws the feature block (VOC · Task · 설문) of the space it sits in once the app's link store answers; completion must reach it with no navigation (#1289 node j). */
/** The mock assembly's answer (ADR-0009: tests reach `src/dev/**` only through the assembly). */
const MOCK_SPACE_SYSTEMS: SpaceSystems = await ((await createAssembly({ registry })) as Assembly).spaceSystems!();

async function mountAt(url: string, spaceSystemsSource: Assembly['spaceSystems']) {
  const mock = await createAssembly({ registry }) as Assembly;
  const session = testSession(['platform:view', 'features:access', 'analytics:view', 'equipment:view'], { user: { id: 'feature-user', name: 'feature-user', title: { ko: '기능', en: 'Feature' } } });
  const adapter: PlatformAdapter = { ...mock.adapter, session: () => session };
  const assembly: Assembly = { ...mock, adapter, spaceSystems: spaceSystemsSource };
  window.history.replaceState(null, '', url);
  const makeSlots = () => ({ ...appSlots(assembly, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never), features: featureSlot() });
  return render(<I18nProvider><AppRoot assembly={assembly} queryHistory={undefined as never} location={undefined} makeSlots={makeSlots} /></I18nProvider>);
}

const featureBlock = () => screen.queryByRole('navigation', { name: /^기능 · / });

beforeEach(() => { spaceSystems.reset(); });
afterEach(() => { cleanup(); spaceSystems.reset(); window.history.replaceState(null, '', '/'); });

describe('AppRoot (#1289 node j)', () => {
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
