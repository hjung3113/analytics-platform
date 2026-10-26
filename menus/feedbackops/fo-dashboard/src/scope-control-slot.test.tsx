import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceId } from '@ap/contracts';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { scopeControlSlot } from '@ap/fo-bridge/scope-control';
import { mountAt } from './test-support';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('scopeControlSlot', () => {
  it('returns one stable component for the FeedbackOps space and null for any other', () => {
    const first = scopeControlSlot.For(spaceId('feedbackops'));
    expect(first).not.toBeNull();
    expect(scopeControlSlot.For(spaceId('feedbackops'))).toBe(first);
    expect(scopeControlSlot.For(spaceId('metrics'))).toBeNull();
  });

  it('in the mock preview draws the 목록 범위 label and a disabled 전체 button titled 실서버 필요', () => {
    const Control = scopeControlSlot.For(spaceId('feedbackops'))!;
    mountAt('/feedbackops', { extra: <Control collapsed={false} /> });
    expect(screen.getByText('목록 범위')).toBeTruthy();
    const button = screen.getByRole('button', { name: /전체/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('실서버 필요');
  });

  it('draws nothing when collapsed, and nothing off a menu without the managedSystem page key', () => {
    const Control = scopeControlSlot.For(spaceId('feedbackops'))!;
    mountAt('/feedbackops', { extra: <Control collapsed /> });
    expect(screen.queryByText('목록 범위')).toBeNull();
    cleanup();
    mountAt('/nowhere', { extra: <Control collapsed={false} /> });
    expect(screen.queryByText('목록 범위')).toBeNull();
  });
});
