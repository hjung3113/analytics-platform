// Shared release package order and source-export to dist-target mapping.
export const SDK_PACKAGES = Object.freeze(['contracts', 'kernel', 'ui', 'components', 'shell']);

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
