/**
 * OS notation for shortcut labels (#300, 06 §26 입력 기준 — Windows 우선, 표기는 OS에 맞게): Apple platforms
 * show ⌘, everything else Ctrl. One detector for every shortcut label (AppRail, table copy tooltip).
 */
export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

/** One notation for a Ctrl/⌘ shortcut: `⌘K` on Apple platforms, `Ctrl+K` elsewhere (Windows convention). */
export function shortcutLabel(key: string): string {
  return isMacPlatform() ? `⌘${key}` : `Ctrl+${key}`;
}
