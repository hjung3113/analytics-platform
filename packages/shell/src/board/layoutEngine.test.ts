import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { BOARD_LAYOUT_ENGINE_DEFAULT, BOARD_LAYOUT_ENGINE_KEY, readLayoutEngine } from './layoutEngine';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('board.layoutEngine flag', () => {
  it('defaults to the dock renderer', () => {
    expect(BOARD_LAYOUT_ENGINE_DEFAULT).toBe('dock');
    expect(readLayoutEngine()).toBe('dock');
  });
  it.each(['dock', 'grid'] as const)('honours %s', value => {
    localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, value);
    expect(readLayoutEngine()).toBe(value);
  });
  it.each(['Dock', 'split', '', '1', '"dock"'])('reads %j as the default', value => {
    localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, value);
    expect(readLayoutEngine()).toBe(BOARD_LAYOUT_ENGINE_DEFAULT);
  });
  it('reads the default when storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(readLayoutEngine()).toBe(BOARD_LAYOUT_ENGINE_DEFAULT);
  });
});
