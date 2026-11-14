import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnalysisActionsSlot } from '@ap/kernel';
import { spaceSystems, type SpaceSystems } from '../../space-systems';
import { appSlots, makeAppSlots } from '../../slots';

describe('analysis action slot assembly (#1408)', () => {
  it('passes the app-supplied actions through without a menu exclusion', () => {
    const analysisActions: AnalysisActionsSlot = { Actions: () => null };
    const slots = appSlots(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, analysisActions);
    expect(slots.analysisActions?.Actions).toBe(analysisActions.Actions);
    expect(slots.analysisActions?.appliesTo).toBeUndefined();
    expect(slots.analysisActions?.pageTypes).toEqual(['analysis', 'overview']);
    const narrowed = appSlots(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, { ...analysisActions, pageTypes: ['analysis'] });
    expect(narrowed.analysisActions?.pageTypes).toEqual(['analysis']);
  });
});

describe('the slots hook the Host calls on every render (#1702b)', () => {
  // A stand-in for the compose slot `main.tsx` builds once: identity, not contents, is the contract under test.
  const vocCompose = { Compose: () => null } as never;
  const useAppSlots = makeAppSlots({ notifications: undefined as never, vocCompose, homeTodo: undefined as never, scopeControl: undefined as never, navCounts: undefined as never, spaceNavSection: undefined as never });

  beforeEach(() => { spaceSystems.reset(); });
  afterEach(() => { cleanup(); spaceSystems.reset(); });

  it('rebuilds the slots when the space-systems store answers and keeps the vocCompose identity, so a held draft does not remount', async () => {
    const view = renderHook(() => useAppSlots({ topBarTools: null }));
    const before = view.result.current;
    expect(before.vocCompose).toBe(vocCompose);
    let answer!: (data: SpaceSystems) => void;
    act(() => { spaceSystems.start([], () => new Promise<SpaceSystems>((resolve) => { answer = resolve; })); });
    const pending = view.result.current;
    expect(pending).not.toBe(before);
    expect(pending.vocCompose).toBe(vocCompose);
    await act(async () => { answer({ links: [], platformManagedSystemId: 'platform-system' }); });
    expect(view.result.current).not.toBe(pending);
    expect(view.result.current.vocCompose).toBe(vocCompose);
  });

  it('passes the blocked-place request slot only with a feature API (absent in mock), keeping its identity (ADR-0154 decision 6)', () => {
    const accessRequest = { Pending: () => null, Dialog: () => null };
    const useSlots = makeAppSlots({ notifications: undefined as never, vocCompose, homeTodo: undefined as never, scopeControl: undefined as never, navCounts: undefined as never, spaceNavSection: undefined as never, accessRequest });
    const real = renderHook(() => useSlots({ topBarTools: null, featureApi: { basePath: '/api/features', onSessionLost: () => undefined } }));
    expect(real.result.current.accessRequest).toBe(accessRequest);
    const mock = renderHook(() => useSlots({ topBarTools: null }));
    expect('accessRequest' in mock.result.current).toBe(false);
  });

  it('passes the assembly\'s sidebar notice through and draws none without one (#2022)', () => {
    const notice = <p>notice</p>;
    expect(renderHook(() => useAppSlots({ topBarTools: null, sidebarNotice: notice })).result.current.sidebarNotice).toBe(notice);
    expect('sidebarNotice' in renderHook(() => useAppSlots({ topBarTools: null })).result.current).toBe(false);
  });

  it('leaves the Host defaults (contextBar, boardEntry, topBarTools) to startAppHost', () => {
    const view = renderHook(() => useAppSlots({ topBarTools: <p>tools</p> }));
    expect(view.result.current.topBarTools).toBeUndefined();
    expect(view.result.current.contextBar).toBeUndefined();
    expect(view.result.current.boardEntry).toBeUndefined();
    expect(view.result.current.features).toBeDefined();
  });
});
