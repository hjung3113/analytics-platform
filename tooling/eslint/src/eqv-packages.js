// Exact identities, not a namespace: `@eqv-extra/x` and `@eqv/uix` are other packages (same shape as feature-packages.js).
// EV (equipment visualization) lands under packages/eqv/<name>; the package names stay `@eqv/*`.
export const EQV_PREFIX = '@eqv/';

export const EQV_PACKAGES = Object.freeze([
  'core', 'renderer', 'replay', 'ui', 'views', 'editor', 'platform-adapter',
].map((name) => `${EQV_PREFIX}${name}`));

// The EV components: the one EV package core and renderer may never reach, and the one the design-system rules treat as a component source.
export const EQV_UI_PACKAGE = `${EQV_PREFIX}ui`;

export const isEqvPackage = (source) => EQV_PACKAGES.some(
  (name) => source === name || source.startsWith(`${name}/`),
);
