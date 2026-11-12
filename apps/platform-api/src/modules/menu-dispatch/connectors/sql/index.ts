import { DeclarationBundleError } from '../../declarations-file.js';
import type { ConnectorFactory } from '../types.js';
import { createPostgresConnector } from './postgres.js';

export const sqlConnectorFactory: ConnectorFactory = (target, secrets) => {
  if (target.kind !== 'sql') throw new DeclarationBundleError(['SQL connector requires a sql target']);
  if (target.dialect === 'mssql') throw new DeclarationBundleError(['sql dialect mssql is not available yet (ADR-0153 node 1839b2)']);
  return createPostgresConnector(target, secrets);
};
