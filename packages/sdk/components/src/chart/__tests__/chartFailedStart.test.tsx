import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import EChartImpl from '../EChartImpl';

// #1862: a chart whose first draw throws must leave nothing registered; the engine is a fake whose first setOption fails.
const engine = vi.hoisted(() => ({ dispose: vi.fn(), on: vi.fn(), off: vi.fn(), handlerDispose: vi.fn(), setOption: vi.fn(), disposeThrows: false }));
const observers = vi.hoisted(() => ({ disconnect: vi.fn() }));

vi.mock('echarts/core', async importOriginal => {
  const actual = await importOriginal<typeof import('echarts/core')>();
  return {
    ...actual,
    init: vi.fn(() => ({
      setOption: engine.setOption, on: engine.on, off: engine.off, resize: vi.fn(), getWidth: () => 100, isDisposed: () => false,
      getZr: () => ({ handler: { dispose: engine.handlerDispose } }),
      dispose: () => { engine.dispose(); if (engine.disposeThrows) throw new Error('dispose failed'); },
    })),
  };
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() { observers.disconnect(); } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); engine.disposeThrows = false; });

const option = { series: [{ id: 'a', type: 'line', data: [1] }] };

it('a failed first draw disposes the engine, disconnects the observer and registers no handlers, once, even if zrender throws on dispose', () => {
  engine.setOption.mockImplementation(() => { throw new Error('no context'); });
  engine.disposeThrows = true;
  const { unmount } = render(<I18nProvider><EChartImpl option={option} ariaLabel="plot" onEvents={{ click: () => {} }} /></I18nProvider>);
  expect(engine.dispose).toHaveBeenCalledTimes(1);
  expect(engine.handlerDispose).toHaveBeenCalledTimes(1);
  expect(observers.disconnect).toHaveBeenCalledTimes(1);
  expect(engine.on).not.toHaveBeenCalled();
  unmount();
  expect(engine.dispose).toHaveBeenCalledTimes(1);
});

it('a disposal error of a successfully drawn chart propagates on unmount', () => {
  engine.setOption.mockImplementation(() => {});
  engine.disposeThrows = true;
  const { unmount } = render(<I18nProvider><EChartImpl option={option} ariaLabel="plot" /></I18nProvider>);
  expect(() => unmount()).toThrow('dispose failed');
});
