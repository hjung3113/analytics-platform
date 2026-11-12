// Shared release package order and source-export to dist-target mapping.
export const SDK_PACKAGES = Object.freeze(['contracts', 'kernel', 'ui', 'components', 'shell']);

// Release unit 2 (ADR-0143): same tag and SemVer as the SDK five, packed by the same release run.
export const RELEASE_UNIT2_PACKAGES = Object.freeze([
  { name: 'mock-server', dir: 'packages/adapters/mock-server' },
  { name: 'http-adapter', dir: 'packages/adapters/http-adapter' },
  { name: 'server-conformance', dir: 'packages/adapters/server-conformance' },
  { name: 'app-host', dir: 'packages/app-host' },
]);

/** All nine release packages in build order (SDK five first; app-host needs the @ap/shell dist). */
export function releasePackages() {
  return [...SDK_PACKAGES.map((name) => ({ name, dir: `packages/sdk/${name}` })), ...RELEASE_UNIT2_PACKAGES];
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
