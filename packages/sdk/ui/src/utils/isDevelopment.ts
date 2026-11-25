// The one development-only check of the SDK (#2951). `process.env.NODE_ENV` is the expression every bundler replaces
// statically in an application build (Vite, webpack, esbuild), so `if (isDevelopment())` folds to `if (false)` and the
// production bundle drops the guarded code. `import.meta.env` is not used: Vite replaces only a literal `import.meta.env.X`
// read in the module being built, so it never reaches a check that receives `import.meta` as a value. Read on each call,
// so a test can switch NODE_ENV at runtime.
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}
