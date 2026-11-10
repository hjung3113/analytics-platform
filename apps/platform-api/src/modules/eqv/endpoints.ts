// The eqv reads as menu-dispatch declarations (#1645, ADR-0135). Right: `eqv:view` (capability `eqv.view`, Admin through the module
// bypass). `requiresScope: false` and no site-bound Context: real-server Site Scope is enforced by the capability alone until #1087.
// The workspace is the session actor's, never a param. `eqv.topview-context` and `eqv.topview-events` are step 9's.
import type { Db } from '../../db/client.js';
import type { MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { type EqvDeps, eqvAuthorize } from './authorize.js';
import { isLayoutId, REVISION_PATTERN } from './domain/layout-checks.js';
import { EQV_FOCUS_MENU_ID, EQV_STUDIO_MENU_ID, EQV_VIEW_PERMISSION } from './menu.js';
import * as read from './repositories/eqv-read.js';

type Params = Record<string, unknown>;
const bad = (message: string): ParamsJudgment => ({ ok: false, message });

function declare(
  deps: EqvDeps & { db: Db },
  id: string,
  menuId: string,
  paramKeys: readonly string[],
  validate: (params: Params) => ParamsJudgment,
  run: (workspaceId: string, params: Params) => Promise<{ outcome: 'ok' | 'empty'; data: unknown }>,
): MenuEndpointDeclaration {
  return {
    spec: { id, menuId, paramKeys, permission: EQV_VIEW_PERMISSION, requiresScope: false, context: {}, mergeTimeDomain: false },
    authorize: eqvAuthorize(deps, EQV_VIEW_PERMISSION),
    validate,
    handle: async (args) => run(args.actor.workspace_id, args.params),
  };
}

const none = (): ParamsJudgment => ({ ok: true });
const layoutIdOnly = (p: Params): ParamsJudgment => (isLayoutId(p.layoutId) ? { ok: true } : bad('layoutId must be a layout id'));
const found = (data: unknown) => ({ outcome: data === null ? ('empty' as const) : ('ok' as const), data });

export function eqvEndpoints(deps: EqvDeps & { db: Db }): MenuEndpointDeclaration[] {
  const S = EQV_STUDIO_MENU_ID;
  return [
    declare(deps, 'eqv.layouts', S, [], none, async (ws) => ({ outcome: 'ok', data: { rows: await read.listDrafts(deps.db, ws) } })),
    declare(deps, 'eqv.layoutDraft', S, ['layoutId'], layoutIdOnly, async (ws, p) => found(await read.getDraft(deps.db, ws, String(p.layoutId)))),
    declare(deps, 'eqv.layoutRevisions', S, ['layoutId'], layoutIdOnly, async (ws, p) => ({
      outcome: 'ok',
      data: { rows: await read.listRevisions(deps.db, ws, String(p.layoutId)) },
    })),
    declare(
      deps,
      'eqv.layoutRevision',
      S,
      ['layoutId', 'revision'],
      (p) => (!isLayoutId(p.layoutId) ? bad('layoutId must be a layout id') : typeof p.revision === 'string' && REVISION_PATTERN.test(p.revision) ? { ok: true } : bad('revision must be sha256:<64 hex>')),
      async (ws, p) => found(await read.getRevision(deps.db, ws, String(p.layoutId), String(p.revision))),
    ),
    declare(deps, 'eqv.templates', S, [], none, async (ws) => ({ outcome: 'ok', data: { rows: await read.listTemplates(deps.db, ws) } })),
    declare(
      deps,
      'eqv.template',
      S,
      ['templateId'],
      (p) => (isLayoutId(p.templateId) ? { ok: true } : bad('templateId must be a template id')),
      async (ws, p) => found(await read.getTemplate(deps.db, ws, String(p.templateId))),
    ),
    declare(deps, 'eqv.equipment-options', EQV_FOCUS_MENU_ID, [], none, async (ws) => ({
      outcome: 'ok',
      data: { options: await read.equipmentOptions(deps.db, ws) },
    })),
  ];
}
