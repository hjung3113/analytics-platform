// Shared release package order and source-export to dist-target mapping.
export const SDK_PACKAGES = Object.freeze(['contracts', 'kernel', 'ui', 'components', 'shell']);

// Release unit 2 (ADR-0143): same tag and SemVer as the SDK five, packed by the same release run.
export const RELEASE_UNIT2_PACKAGES = Object.freeze([
  { name: 'mock-server', dir: 'packages/host/mock-server' },
  { name: 'http-adapter', dir: 'packages/host/http-adapter' },
  { name: 'server-conformance', dir: 'packages/host/server-conformance' },
  { name: 'app-host', dir: 'packages/host/app-host' },
]);

/** All nine release packages in build order (SDK five first; app-host needs the @ap/shell dist). */
export function releasePackages() {
  return [...SDK_PACKAGES.map((name) => ({ name, dir: `packages/sdk/${name}` })), ...RELEASE_UNIT2_PACKAGES];
}

/** Workspace-only test entries: never released, whatever the manifest says. */
const WORKSPACE_ONLY_EXPORTS = new Set(['./testing/saved-view-panels']);

/** Source exports included in the released package. */
export function releaseSourceEntries(manifest) {
  const workspace = manifest.exports ?? {};
  const entries = Object.entries(workspace).filter(([subpath]) => !WORKSPACE_ONLY_EXPORTS.has(subpath));
  const published = manifest.publishConfig?.exports;
  if (!published) return entries;

  for (const subpath of Object.keys(published)) {
    if (WORKSPACE_ONLY_EXPORTS.has(subpath)) {
      throw new Error(`${manifest.name}: workspace-only export "${subpath}" must not be in publishConfig.exports`);
    }
    if (!Object.hasOwn(workspace, subpath)) {
      throw new Error(`${manifest.name}: export "${subpath}" is missing from workspace exports`);
    }
  }
  return entries.filter(([subpath]) => {
    if (Object.hasOwn(published, subpath)) return true;
    throw new Error(`${manifest.name}: export "${subpath}" is missing from publishConfig.exports`);
  });
}

/** './src/theme/index.ts' → { types: './dist/theme/index.d.ts', import: './dist/theme/index.js' }; CSS/JSON → './dist/…'. */
export function distTarget(target, label) {
  if (typeof target !== 'string' || !target.startsWith('./src/')) {
    throw new Error(`${label}: export target ${JSON.stringify(target)} must start with ./src/`);
  }
  const inDist = `./dist/${target.slice('./src/'.length)}`;
  if (/\.tsx?$/.test(inDist)) {
    const stem = inDist.replace(/\.tsx?$/, '');
    return { types: `${stem}.d.ts`, import: `${stem}.js` };
  }
  return inDist;
}
