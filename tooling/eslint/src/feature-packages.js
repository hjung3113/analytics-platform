import { PACKAGE_PREFIX } from './prefix.js';

// Exact identities, not a namespace: consumer packages now share the SDK prefix.
export const FEATURE_PACKAGES = Object.freeze([
  'platform-api', 'feature-screens', 'feature-shared', 'feature-ui', 'platform-api-ops',
].map((name) => `${PACKAGE_PREFIX}${name}`));

export const isFeaturePackage = (source) => FEATURE_PACKAGES.some(
  (name) => source === name || source.startsWith(`${name}/`),
);
