// PlatformDataTable and tableExport use this bundler-neutral helper for development diagnostics.
// Only a positive Vite PROD or NODE_ENV=production signal suppresses those diagnostics.
export function isProductionEnv(meta: { env?: { PROD?: boolean } }, g: { process?: { env?: { NODE_ENV?: string } } }): boolean {
  return meta.env?.PROD === true || g.process?.env?.NODE_ENV === 'production';
}
