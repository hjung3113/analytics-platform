// Provider-less chart consumption from the release tarballs (#1953): a consumer that has no platform at all (no PlatformProvider, no Registry, no
// menu manifest) renders `LaneTimeline` inside `I18nProvider` alone, and its image actions stay off until the consumer opts in. The same spec, written
// against the workspace source, is in packages/sdk/components (chartImageCopy.button.test.tsx); this one proves it for the packed, installed packages.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LaneTimeline } from '@ap/components';
import { I18nProvider } from '@ap/kernel';

const lanes = [{ id: 'lane-1', label: 'Lane 1', segments: [{ id: 'seg-1', start: 0, end: 10 }, { id: 'seg-2', start: 12, end: 30 }] }];

beforeEach(() => {
  // jsdom has no layout engine, frame loop or 2D canvas: the chart's own drawing is not what this checks.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // A drawing context that accepts every call: the chart takes its real path (canvas layers, axis, controls) instead of its engine-unavailable state.
  const context = new Proxy({}, { get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('LaneTimeline renders inside I18nProvider alone, with no PlatformProvider', () => {
  render(<I18nProvider><LaneTimeline lanes={lanes} ariaLabel="Provider-less timeline" /></I18nProvider>);
  expect(screen.getAllByLabelText('Provider-less timeline').length).toBeGreaterThan(0);
  // The zoom controls are the chart's own; they are drawn without any platform.
  expect(screen.getByRole('button', { name: '확대' })).toBeTruthy();
});

it('the image actions stay off by default: imageCopy and imagePrint alone draw no button without a platform', () => {
  render(<I18nProvider><LaneTimeline lanes={lanes} ariaLabel="Provider-less timeline" imageCopy imagePrint /></I18nProvider>);
  expect(screen.getAllByLabelText('Provider-less timeline').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: '이미지 복사' })).toBeNull();
  expect(screen.queryByRole('button', { name: '인쇄' })).toBeNull();
});
