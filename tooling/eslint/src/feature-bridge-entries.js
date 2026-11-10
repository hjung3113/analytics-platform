import fs from 'node:fs';

import { PACKAGE_PREFIX } from './prefix.js';

const FEATURE_SCREENS_MANIFEST = new URL('../../../apps/feature-screens/package.json', import.meta.url);
const FEATURE_SCREENS = `${PACKAGE_PREFIX}feature-screens`;

/**
 * Bridge entries of the feature-screens package: `apps/feature-screens/package.json` `exports` is the only list
 * (an exact list, no wildcard). A style entry (`*.css`) is a public surface but not a screen entry, so it is
 * left out here. The repo-relative read is safe: this private tooling package is neither an SDK package nor packed.
 */
export function featureBridgeEntrySubpaths() {
  const { exports: map } = JSON.parse(fs.readFileSync(FEATURE_SCREENS_MANIFEST, 'utf8'));
  return Object.keys(map)
    .filter((key) => !key.endsWith('.css'))
    .map((key) => {
      if (!key.startsWith('./') || key.includes('*')) throw new Error(`feature-screens exports key ${key}: bridge entries are exact ./<path> keys, no wildcard`);
      return key.slice(2);
    });
}

/** The same entries as full import sources (`<prefix>feature-screens/<path>`). */
export const featureBridgeEntrySources = () => featureBridgeEntrySubpaths().map((sub) => `${FEATURE_SCREENS}/${sub}`);
