import { cleanup, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { group, installResizeObserver, mountDock, row } from './harness';

// #1173: the engine watches each group's own box. A real ResizeObserver reports a frame after `observe()`, so a group can leave before its first report.
const observer = installResizeObserver({ deferred: true });
beforeAll(() => { observer.resize(900, 600); });
afterAll(() => { observer.restore(); });
afterEach(() => { cleanup(); });

describe('DockLayout group observation', () => {
  it('releases a group that is removed before its first size report', async () => {
    const view = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
    await screen.findAllByRole('tab');
    const before = Array.from(document.querySelectorAll('.dv-groupview'));
    expect(before).toHaveLength(2);
    observer.unobserved.length = 0;

    view.controls.setLayout(row([100], group(['a'])));
    const gone = before.filter(element => !element.isConnected);
    expect(gone.length).toBeGreaterThan(0);
    observer.deliver();
    for (const element of gone) expect(observer.unobserved).toContain(element);
  });
});
