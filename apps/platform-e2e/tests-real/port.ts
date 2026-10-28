/** Require a whole-string integer port; only an absent variable uses the default. */
export function parsePort(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const port = /^[0-9]+$/.test(raw) ? Number.parseInt(raw, 10) : 0;
  if (port < 1 || port > 65535) throw new Error(`${name} must be an integer port in 1..65535, got ${JSON.stringify(raw)}`);
  return port;
}
