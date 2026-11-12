import { DeclarationBundleError } from '../../declarations-file.js';
import type { ConnectorFactory } from '../types.js';
import { createMssqlConnector } from './mssql.js';
import { createPostgresConnector } from './postgres.js';

export const sqlConnectorFactory: ConnectorFactory = (target, secrets) => {
  if (target.kind !== 'sql') throw new DeclarationBundleError(['SQL connector requires a sql target']);
  if (target.dialect === 'mssql') return createMssqlConnector(target, secrets);
  return createPostgresConnector(target, secrets);
};
