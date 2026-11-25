// The one development-only check of the SDK (#2951). `process.env.NODE_ENV` is the expression every bundler replaces
// statically in an application build (Vite, webpack, esbuild), so `if (isDevelopment())` folds to `if (false)` and the
// production bundle drops the guarded code. `import.meta.env` is not used: Vite replaces only a literal `import.meta.env.X`
// read in the module being built, so it never reaches a check that receives `import.meta` as a value. Read on each call,
// so a test can switch NODE_ENV at runtime. A browser bundle must replace `process.env.NODE_ENV` (Vite, webpack and esbuild
// do by default); a build that turns the replacement off has no global `process`, as with the SDK's existing
// `process.env.NODE_ENV` checks (Button, chart diagnostics).
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}
