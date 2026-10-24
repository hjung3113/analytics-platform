import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, type VocComposeContext } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { json, registry, stubFetch, switchableAdapter } from './fo/test-support';
import { vocComposeSlot } from '@ap/fo-bridge/voc-compose-slot';

const CONTEXT: VocComposeContext = { items: [], href: null, spaceId: null, menuId: null };

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); });

describe('VOC compose slot', () => {
  it('draws its own fallback while the page chunk loads, then the page (실서버 필요 and no request without a FeedbackOps API)', async () => {
    setFoApi(null);
    const calls = stubFetch(() => json({}));
    const { Compose } = vocComposeSlot(() => null);
    render(<I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}>
      <Compose context={CONTEXT} onSubmitted={vi.fn()} onCancel={vi.fn()} onDirtyChange={vi.fn()} /></PlatformProvider></I18nProvider>);
    // The first render is synchronous, before the lazy import resolves: the fallback is inside the slot, not a Suspense boundary above it.
    expect(screen.getByRole('status', { name: 'VOC 등록 불러오는 중' })).toBeTruthy();
    expect((await screen.findByText('실서버 필요')).textContent).toBe('실서버 필요');
    expect(screen.queryByRole('status', { name: 'VOC 등록 불러오는 중' })).toBeNull();
    expect(calls).toEqual([]);
  });
});
