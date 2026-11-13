import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installResizeObserver, group, mountDock, row } from './harness';

// A panel whose content throws while rendering is contained in that panel: the other panels and the workspace stay, and the failure is
// reported through the Kernel's shell-region report (the same report path as a shell region failing beside a healthy screen).
const report = vi.hoisted(() => vi.fn((_error: unknown) => 'corr-panel-1'));
vi.mock('@ap/kernel/host', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/kernel/host')>(),
  useHostPlatformOptional: () => ({ reportShellError: report, session: { user: { id: 'u1' } }, revision: 'r1' }),
}));

let broken = true;
let restore: () => void;
beforeEach(() => { broken = true; report.mockClear(); restore = installResizeObserver().restore; vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); });

function Boom(): never { throw new Error('panel content exploded'); }
/** The panel's own error state: the engine has a live region of role alert too. */
const panelAlert = () => waitFor(() => {
  const found = document.querySelector<HTMLElement>('[data-dock-panel="a"] [role="alert"]');
  if (!found) throw new Error('no panel alert yet');
  return found;
}, { timeout: 30000 });
const inner = (id: string) => (id === 'a' && broken ? <Boom /> : null);

describe('DockLayout panel content failure', () => {
  it('contains the failure in its panel, keeps the other panels and reports it once', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'], inner });
    const alert = await panelAlert();
    expect(screen.getByTestId('content-b')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '테스트 배치' })).toBeInTheDocument();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'panel content exploded' }));
    expect(alert).toHaveTextContent('corr-panel-1');
  }, 60000);

  it('retries only that panel', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'], inner });
    const alert = await panelAlert();
    broken = false;
    fireEvent.click(within(alert).getByRole('button'));
    expect(await screen.findByTestId('content-a')).toBeInTheDocument();
    expect(document.querySelector('[data-dock-panel="a"] [role="alert"]')).toBeNull();
  }, 60000);
});
