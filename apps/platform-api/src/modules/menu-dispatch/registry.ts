// Registration and startup validation of the menu ports' server declarations
// (real-server-checklist §3 «등록 검증»). A failing validation throws, which stops `buildServer`.
// Checks the server can make without the app's menu Registry: duplicate ids, `invalidates` entries
// are registered endpoints of the same menu, a `version` action has `currentVersion`, `limits`
// rules, scope-free endpoints applying no site-bound Context (rule 6), and the two refusals that wait
// for a server Scope resolver (#1087).
//
// Action replay size bound: an `ok` answer is stored whole in `core.idempotency_keys` for replay, up to
// 128 KiB of JSON (`MENU_ACTION_REPLAY_MAX_BYTES`). A handler whose `data` is larger gets its transaction
// rolled back and the answer `error` (`response too large to record`), so a handler's `data` must fit.

import type {
  ActionDeclarationSpec,
  ContextKey,
  EndpointDeclarationSpec,
  MenuActionDeclaration,
  MenuDispatchContribution,
  MenuEndpointDeclaration,
} from './types.js';
import { CONTEXT_KEYS } from './types.js';

export interface MenuDispatchRegistry {
  endpoint(id: string): MenuEndpointDeclaration | undefined;
  action(id: string): MenuActionDeclaration | undefined;
  readonly endpointIds: readonly string[];
  readonly actionIds: readonly string[];
}

/** Paging params: `limits.maxRows` is refused beside them (checklist rule 7, #175). */
const PAGING_KEYS = ['page', 'pageSize', 'cursor'] as const;

/** Site-bound Context keys: a scope-free endpoint may not apply them (checklist §3 rule 6; same set as the mock adapter). */
const SITE_BOUND_KEYS = ['roomNames', 'condition', 'selection', 'lot', 'recipe', 'ppid'] as const;

const SCOPE_BLOCKER =
  'the server has no Scope resolver yet (#1087); site/room grants cannot be judged';

export class MenuDispatchRegistrationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`menu dispatch registration refused:\n- ${problems.join('\n- ')}`);
    this.name = 'MenuDispatchRegistrationError';
  }
}

function endpointProblems(spec: EndpointDeclarationSpec): string[] {
  const at = `endpoint ${spec.id}`;
  const problems: string[] = [];
  if (spec.requiresScope) problems.push(`${at}: requiresScope is refused — ${SCOPE_BLOCKER}`);
  if (spec.mergeTimeDomain) {
    problems.push(
      `${at}: mergeTimeDomain is refused — step 7 (§6.3) compares the time domains of the resolved equipment set, and ${SCOPE_BLOCKER}`,
    );
  }
  if (!spec.requiresScope) {
    for (const key of SITE_BOUND_KEYS) {
      if (spec.context[key] === 'apply') {
        problems.push(`${at}: a scope-free endpoint cannot apply site-bound context ${key}`);
      }
    }
  }
  for (const key of spec.requiredContext ?? []) {
    if (spec.context[key] !== 'apply') problems.push(`${at}: requiredContext ${key} is not applied`);
  }
  for (const key of Object.keys(spec.context)) {
    if (!CONTEXT_KEYS.includes(key as ContextKey)) problems.push(`${at}: unknown context key ${key}`);
  }
  const { limits } = spec;
  if (limits?.maxRows !== undefined) {
    if (!Number.isSafeInteger(limits.maxRows) || limits.maxRows <= 0) {
      problems.push(`${at}: limits.maxRows must be a positive integer`);
    }
    if (PAGING_KEYS.some((key) => spec.paramKeys.includes(key))) {
      problems.push(`${at}: limits.maxRows is refused on a paged endpoint (page/pageSize/cursor)`);
    }
  }
  if (limits?.maxHours !== undefined) {
    if (!Number.isFinite(limits.maxHours) || limits.maxHours <= 0) {
      problems.push(`${at}: limits.maxHours must be a positive number`);
    }
    if (spec.context.time !== 'apply') problems.push(`${at}: limits.maxHours needs context.time = apply`);
  }
  if (new Set(spec.paramKeys).size !== spec.paramKeys.length) {
    problems.push(`${at}: duplicate paramKeys`);
  }
  return problems;
}

function actionProblems(
  spec: ActionDeclarationSpec,
  declaration: MenuActionDeclaration,
  endpointMenus: ReadonlyMap<string, string>,
): string[] {
  const at = `action ${spec.id}`;
  const problems: string[] = [];
  if (spec.requiresScope) problems.push(`${at}: requiresScope is refused — ${SCOPE_BLOCKER}`);
  if (spec.concurrency === 'version' && typeof declaration.currentVersion !== 'function') {
    problems.push(`${at}: concurrency 'version' needs a currentVersion reader`);
  }
  for (const id of spec.invalidates) {
    const menuId = endpointMenus.get(id);
    if (menuId === undefined) problems.push(`${at}: invalidates ${id}, which is not a registered endpoint`);
    else if (menuId !== spec.menuId) {
      problems.push(`${at}: invalidates ${id}, which belongs to menu ${menuId}, not ${spec.menuId}`);
    }
  }
  if (new Set(spec.inputKeys).size !== spec.inputKeys.length) problems.push(`${at}: duplicate inputKeys`);
  return problems;
}

/** Builds the registry from what modules contribute; throws `MenuDispatchRegistrationError` on any problem. */
export function createMenuDispatchRegistry(
  contributions: readonly MenuDispatchContribution[],
): MenuDispatchRegistry {
  const endpoints = new Map<string, MenuEndpointDeclaration>();
  const actions = new Map<string, MenuActionDeclaration>();
  const problems: string[] = [];
  for (const contribution of contributions) {
    for (const declaration of contribution.endpoints ?? []) {
      const { id } = declaration.spec;
      if (endpoints.has(id)) problems.push(`endpoint ${id}: registered twice`);
      else endpoints.set(id, declaration);
    }
    for (const declaration of contribution.actions ?? []) {
      const { id } = declaration.spec;
      if (actions.has(id)) problems.push(`action ${id}: registered twice`);
      else actions.set(id, declaration);
    }
  }
  const endpointMenus = new Map([...endpoints].map(([id, d]) => [id, d.spec.menuId]));
  for (const declaration of endpoints.values()) problems.push(...endpointProblems(declaration.spec));
  for (const declaration of actions.values()) {
    problems.push(...actionProblems(declaration.spec, declaration, endpointMenus));
  }
  if (problems.length > 0) throw new MenuDispatchRegistrationError(problems);
  return {
    endpoint: (id) => endpoints.get(id),
    action: (id) => actions.get(id),
    endpointIds: [...endpoints.keys()],
    actionIds: [...actions.keys()],
  };
}
