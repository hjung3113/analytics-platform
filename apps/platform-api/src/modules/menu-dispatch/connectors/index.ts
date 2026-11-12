import type { ConnectorFactories } from './types.js';
import { sqlConnectorFactory } from './sql/index.js';

// Assembly requests a factory per leg; retain one pool per immutable target/secret pair.
const cache = new WeakMap<object, { secrets: unknown; connector: ReturnType<typeof sqlConnectorFactory> }>();
export const connectorFactories: ConnectorFactories = Object.freeze({
  sql: (target, secrets) => {
    const existing = cache.get(target);
    if (existing && existing.secrets === secrets) return existing.connector;
    const connector = sqlConnectorFactory(target, secrets);
    cache.set(target, { secrets, connector });
    return connector;
  },
});
