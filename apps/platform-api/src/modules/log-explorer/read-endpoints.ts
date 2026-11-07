// `logExplorer.records|window|parsed|periods` as menu-dispatch declarations (#1469, design §5). Entry right: every active workspace
// session (`platform:view`, the rule the other direct list menus use). The data right `explorer.source.read` is judged per request inside
// the read (read-service.ts), because it depends on the Source owner named in the params and must answer as a state, not a refusal.

import type { EndpointResult, MenuDispatchContribution, MenuEndpointDeclaration, EndpointHandlerArgs, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import type { LogExplorerReadDeps } from './deps.js';
import {
  PARSED_PARAM_KEYS,
  PERIODS_PARAM_KEYS,
  RECORDS_PARAM_KEYS,
  WINDOW_PARAM_KEYS,
  judgmentOf,
  parseParsedParams,
  parsePeriodsParams,
  parseRecordsParams,
  parseWindowParams,
  type Parsed,
} from './domain/read-params.js';
import { guardSourceReadPort } from './ports/guarded.js';
import { createReadService } from './read-service.js';

/** The menu that owns the log explorer reads. */
export const LOG_EXPLORER_MENU_ID = 'log-explorer';

function declare<T>(
  deps: LogExplorerReadDeps,
  name: string,
  paramKeys: readonly string[],
  parse: (params: Record<string, unknown>) => Parsed<T>,
  run: (args: EndpointHandlerArgs, value: T) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id: `logExplorer.${name}`,
      menuId: LOG_EXPLORER_MENU_ID,
      paramKeys,
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate: (params): ParamsJudgment => judgmentOf(parse(params)),
    async handle(args) {
      const parsed = parse(args.params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return run(args, parsed.value);
    },
  };
}

export function logExplorerReadEndpoints(deps: LogExplorerReadDeps): MenuEndpointDeclaration[] {
  const port = deps.sourceReadPort ? guardSourceReadPort(deps.sourceReadPort) : null;
  const service = createReadService(deps, port);
  return [
    declare(deps, 'records', RECORDS_PARAM_KEYS, parseRecordsParams, (args, input) => service.records(args, input)),
    declare(deps, 'window', WINDOW_PARAM_KEYS, parseWindowParams, (args, input) => service.window(args, input)),
    declare(deps, 'parsed', PARSED_PARAM_KEYS, parseParsedParams, (args, input) => service.parsed(args, input)),
    declare(deps, 'periods', PERIODS_PARAM_KEYS, parsePeriodsParams, (args, input) => service.periods(args, input)),
  ];
}

export function logExplorerContribution(deps: LogExplorerReadDeps): MenuDispatchContribution {
  return { endpoints: logExplorerReadEndpoints(deps) };
}
