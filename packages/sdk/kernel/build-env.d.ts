// Build-only: lets tsconfig.build.json compile drillValueLabel's `process.env.NODE_ENV` check without @types/node (#2951).
// Bundlers replace that expression statically; the emitted .d.ts files never reference it.
declare const process: { env: { NODE_ENV?: string } };
