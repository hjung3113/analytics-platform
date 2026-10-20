// Build-only: lets tsconfig.build.json compile Button's `process.env.NODE_ENV` guard without @types/node.
// Bundlers replace that expression statically; the emitted .d.ts files never reference it.
declare const process: { env: { NODE_ENV?: string } };
