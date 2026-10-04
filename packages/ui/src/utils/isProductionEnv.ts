// Dev/prod gate bundler-neutral without @types/node: production only on a positive signal (Vite PROD or NODE_ENV=production), so dev/test/plain-Node keep the old dev-throw; casts: ImportMeta gains `env` only from vite/client types, which @ap/ui deliberately does not reference.
export function isProductionEnv(meta: { env?: { PROD?: boolean } }, g: { process?: { env?: { NODE_ENV?: string } } }): boolean {
  return meta.env?.PROD === true || g.process?.env?.NODE_ENV === 'production';
}
