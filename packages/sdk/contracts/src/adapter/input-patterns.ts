/** Existing port input syntax, also emitted in vocab.json for servers outside the TypeScript workspace. */
export const PORT_INPUT_PATTERNS = {
  auditType: { source: '^[A-Za-z][A-Za-z0-9_.:-]{0,79}$', flags: '' },
  menuId: { source: String.raw`^[^\s?#&/=\p{C}]{1,80}$`, flags: 'u' },
  filterText: { source: String.raw`^[^?#&\s]{1,80}(?![\s\S])`, flags: '' },
} as const;

export const AUDIT_TYPE_TOKEN = new RegExp(PORT_INPUT_PATTERNS.auditType.source, PORT_INPUT_PATTERNS.auditType.flags);
export const MENU_ID_PATTERN = new RegExp(PORT_INPUT_PATTERNS.menuId.source, PORT_INPUT_PATTERNS.menuId.flags);
export const FILTER_TEXT_PATTERN = new RegExp(PORT_INPUT_PATTERNS.filterText.source, PORT_INPUT_PATTERNS.filterText.flags);
export const invalidFilterText = (value: unknown): boolean => typeof value !== 'string' || !FILTER_TEXT_PATTERN.test(value);
