// The one Node global SDK source reads: dev-only checks compare `process.env.NODE_ENV`, which the consumer's bundler replaces
// (#2951, #3028). SDK dist builds run with `types: []` so the emitted declarations never need @types/node; this declares just
// that expression for them. Workspace typechecks get the full type from @types/node instead (#3030).
declare const process: { readonly env: { readonly NODE_ENV?: string } };
