import { afterEach, describe, expect, it } from 'vitest';
import { isMacPlatform, shortcutLabel } from './platform';

// 06 §26: Windows first, notation per OS — one form for every Ctrl/⌘ shortcut label (#300 UX review).
describe('shortcutLabel', () => {
  afterEach(() => { Reflect.deleteProperty(navigator, 'platform'); });
  const onPlatform = (value: string) => Object.defineProperty(navigator, 'platform', { configurable: true, value });

  it.each([
    ['Win32', false, 'Ctrl+K'],
    ['Linux x86_64', false, 'Ctrl+K'],
    ['MacIntel', true, '⌘K'],
    ['iPad', true, '⌘K'],
  ])('%s → %s', (platform, mac, label) => {
    onPlatform(platform);
    expect(isMacPlatform()).toBe(mac);
    expect(shortcutLabel('K')).toBe(label);
  });
});
