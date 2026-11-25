import { render } from '@testing-library/react';
import { useEffect, useLayoutEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useLatestRef } from './latestRef';

// BoardDock and ContextBarLayout read their effect callbacks through this ref (#2955: no useEffectEvent below React 19.2).
function Probe({ trigger, onRun, onLayout }: { trigger: number; onRun: (trigger: number) => void; onLayout: (trigger: number) => void }) {
  const run = useLatestRef(() => { onRun(trigger); });
  const layout = useLatestRef(() => { onLayout(trigger); });
  useLayoutEffect(() => { layout.current(); }, [trigger, layout]);
  useEffect(() => { run.current(); }, [trigger, run]);
  return null;
}

describe('useLatestRef (#2955)', () => {
  it('a new inline handler on rerender is not called again; the trigger calls the latest one, also from a layout effect', () => {
    const first = vi.fn(); const second = vi.fn(); const layoutFirst = vi.fn(); const layoutSecond = vi.fn();
    const view = render(<Probe trigger={1} onRun={value => first(value)} onLayout={value => layoutFirst(value)} />);
    expect(first).toHaveBeenCalledTimes(1);
    expect(layoutFirst).toHaveBeenCalledTimes(1);
    view.rerender(<Probe trigger={1} onRun={value => second(value)} onLayout={value => layoutSecond(value)} />);
    view.rerender(<Probe trigger={1} onRun={value => second(value)} onLayout={value => layoutSecond(value)} />);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(layoutSecond).not.toHaveBeenCalled();
    view.rerender(<Probe trigger={2} onRun={value => second(value)} onLayout={value => layoutSecond(value)} />);
    expect(second).toHaveBeenCalledExactlyOnceWith(2);
    expect(layoutSecond).toHaveBeenCalledExactlyOnceWith(2);
    expect(first).toHaveBeenCalledTimes(1);
  });
});
