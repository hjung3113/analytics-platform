import { sha256Hex } from '../values/sha256.js';
// Menu declaration snapshot (#1900, ADR-0156): the menu-owned half of what the core server serves — menus, the app's
// permission vocabulary, endpoint and action declarations — as one JSON file the app assembly build writes. The core
// server refuses a declaration bundle whose menu-owned fields differ from it. Pure: no Node, DOM or Vite import; the
// build hands this module the loaded Registry input and declaration modules. The zod schema and JSON Schema of the
// file are `menuDeclarationSnapshotSchema` in `@ap/contract-schemas`; its tests pin this emitter to that schema.
import type { AnyActionSpec } from '../adapter/action.js';
import type { AnyEndpointSpec } from './menu-query.js';
import type { Capability, ContextKey } from './menu.js';
import type { AssessmentKind } from '../adapter/response.js';

export const MENU_DECLARATION_SNAPSHOT_VERSION = 2 as const;
/** The file name the app assembly build writes into its output folder. */
export const MENU_DECLARATION_SNAPSHOT_FILE = 'menu-declarations.snapshot.json';

export type SnapshotContext = Partial<Record<ContextKey, Exclude<Capability, 'unsupported'>>>;

export type SnapshotMenu = { id: string; space: string; permission: string; requiresScope: boolean; context: SnapshotContext };
export type SnapshotEndpoint = {
  id: string;
  menuId: string;
  paramKeys: string[];
  permission: string;
  requiresScope: boolean;
  context: SnapshotContext;
  requiredContext?: ContextKey[];
  kinds: AssessmentKind[];
  limits?: { maxHours?: number; maxRows?: number };
  mergeTimeDomain: boolean;
};
export type SnapshotAction = {
  id: string;
  menuId: string;
  inputKeys: string[];
  permission: string;
  requiresScope: boolean;
  concurrency: 'none' | 'version';
  /** Endpoint ids the action makes stale. */
  invalidates: string[];
};
export type MenuDeclarationSnapshot = {
  schemaVersion: typeof MENU_DECLARATION_SNAPSHOT_VERSION;
  /** `@ap/contracts` version the app was built with. */
  sdkVersion: string;
  menus: SnapshotMenu[];
  /** The app-declared permission vocabulary (`createRegistry({ permissions })`); kernel permissions are the server's own. */
  permissions: string[];
  endpoints: SnapshotEndpoint[];
  actions: SnapshotAction[];
  /** `sha256:<hex>` over the canonical JSON (`canonicalJson`) of every other field. */
  digest: string;
};

/** What the emitter reads of a menu: the assembly resolves the group space first. Empty space marks a global menu. */
export type SnapshotMenuInput = { readonly id: string; readonly space: string; readonly permission: string; readonly requiresScope: boolean; readonly context: Readonly<Partial<Record<ContextKey, Capability>>> };

export type MenuDeclarationSnapshotInput = {
  sdkVersion: string;
  menus: readonly SnapshotMenuInput[];
  permissions?: readonly string[];
  endpoints: readonly AnyEndpointSpec[];
  actions?: readonly AnyActionSpec[];
};

export class MenuDeclarationSnapshotError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`menu declaration snapshot refused:\n- ${problems.join('\n- ')}`);
    this.name = 'MenuDeclarationSnapshotError';
  }
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function applied(context: Readonly<Partial<Record<ContextKey, Capability>>>): SnapshotContext {
  const out: SnapshotContext = {};
  for (const key of Object.keys(context).sort() as ContextKey[]) {
    const capability = context[key];
    if (capability === 'apply' || capability === 'reference') out[key] = capability;
  }
  return out;
}

function endpointRow(spec: AnyEndpointSpec): SnapshotEndpoint {
  return {
    id: spec.id,
    menuId: spec.menuId,
    paramKeys: Object.keys(spec.paramKeys),
    permission: spec.permission,
    requiresScope: spec.requiresScope,
    context: applied(spec.context),
    ...(spec.requiredContext === undefined ? {} : { requiredContext: [...spec.requiredContext] }),
    kinds: [...spec.kinds],
    ...(spec.limits === undefined ? {} : { limits: { ...spec.limits } }),
    mergeTimeDomain: spec.mergeTimeDomain,
  };
}

function actionRow(spec: AnyActionSpec): SnapshotAction {
  return {
    id: spec.id,
    menuId: spec.menuId,
    inputKeys: Object.keys(spec.inputKeys),
    permission: spec.permission,
    requiresScope: spec.requiresScope,
    concurrency: spec.concurrency,
    invalidates: spec.invalidates.map((query) => query.id),
  };
}

/**
 * Builds the snapshot: rows sorted by id, the vocabulary sorted and de-duplicated, `digest` over the rest. Throws
 * `MenuDeclarationSnapshotError` on a duplicate menu, endpoint or action id (the server could not tell which row is meant).
 */
export function menuDeclarationSnapshot(input: MenuDeclarationSnapshotInput): MenuDeclarationSnapshot {
  const problems: string[] = [];
  const unique = (kind: string, ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${kind} ${id}: declared more than once`);
      seen.add(id);
    }
  };
  unique('menu', input.menus.map((menu) => menu.id));
  for (const menu of input.menus) {
    if (typeof menu.space !== 'string' || /[\s?#&/]/.test(menu.space) || menu.space.includes(String.fromCharCode(0))) problems.push(`menu ${menu.id}: invalid space`);
  }
  unique('endpoint', input.endpoints.map((spec) => spec.id));
  unique('action', (input.actions ?? []).map((spec) => spec.id));
  if (problems.length > 0) throw new MenuDeclarationSnapshotError(problems);

  const body: Omit<MenuDeclarationSnapshot, 'digest'> = {
    schemaVersion: MENU_DECLARATION_SNAPSHOT_VERSION,
    sdkVersion: input.sdkVersion,
    menus: input.menus.map((menu) => ({ id: menu.id, space: menu.space, permission: menu.permission, requiresScope: menu.requiresScope, context: applied(menu.context) })).sort(byId),
    permissions: [...new Set(input.permissions ?? [])].sort(),
    endpoints: input.endpoints.map(endpointRow).sort(byId),
    actions: (input.actions ?? []).map(actionRow).sort(byId),
  };
  return { ...body, digest: menuDeclarationSnapshotDigest(body) };
}

/** `sha256:<hex>` of `canonicalJson(body)`, `body` being the snapshot without `digest`. The core server recomputes it. */
export function menuDeclarationSnapshotDigest(body: Omit<MenuDeclarationSnapshot, 'digest'>): string {
  return `sha256:${sha256Hex(utf8(canonicalJson(body)))}`;
}

/** JSON with object keys sorted by UTF-16 code unit at every level, no whitespace; arrays keep their order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, inner]) => inner !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Collects every endpoint and action declaration exported by declaration modules (an export, or a plain object of them). */
export function collectDeclarations(modules: readonly Readonly<Record<string, unknown>>[]): { endpoints: AnyEndpointSpec[]; actions: AnyActionSpec[] } {
  // By identity: one declaration exported twice (directly and inside a group object) is one row, while two different
  // objects with one id both stay, so the emitter refuses the duplicate.
  const endpoints = new Set<AnyEndpointSpec>();
  const actions = new Set<AnyActionSpec>();
  const visit = (value: unknown, depth: number) => {
    if (!isRecord(value)) return;
    if (typeof value.id === 'string' && typeof value.menuId === 'string') {
      if (isRecord(value.paramKeys)) endpoints.add(value as AnyEndpointSpec);
      else if (isRecord(value.inputKeys) && Array.isArray(value.invalidates)) actions.add(value as AnyActionSpec);
      return;
    }
    if (depth === 0) for (const inner of Object.values(value)) visit(inner, 1);
  };
  for (const exports of modules) for (const value of Object.values(exports)) visit(value, 0);
  return { endpoints: [...endpoints], actions: [...actions] };
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The plugin context member the snapshot plugin uses (Vite/Rollup `emitFile`); declared here so contracts imports no Vite types. */
export type SnapshotEmitContext = { emitFile(file: { type: 'asset'; fileName: string; source: string }): string };

export type MenuDeclarationSnapshotPluginOptions = {
  /** Module path of the Registry input (`createRegistry`/`startAppHost` declarations). */
  registry: string;
  /** Export name of the Registry input in that module. Default `declarations`. */
  registryExport?: string;
  /** Modules that export the endpoint and action declarations the web uses (each menu's `endpoints.ts`). */
  declarationModules: readonly string[];
  sdkVersion: string;
  /** Loads a module in the build process — Vite's `runnerImport(path).then(r => r.module)`. */
  load: (path: string) => Promise<Readonly<Record<string, unknown>>>;
};

/**
 * Vite build plugin: writes `menu-declarations.snapshot.json` into the build output from the Registry input and the
 * declaration modules. Add it to the build that produces the deployable web for a real server; the file is never
 * written by hand (ADR-0156).
 */
export function menuDeclarationSnapshotPlugin(options: MenuDeclarationSnapshotPluginOptions) {
  return {
    name: 'ap-menu-declaration-snapshot',
    apply: 'build' as const,
    async generateBundle(this: SnapshotEmitContext) {
      const registry = (await options.load(options.registry))[options.registryExport ?? 'declarations'];
      if (!isRecord(registry) || !Array.isArray(registry.menus)) {
        throw new MenuDeclarationSnapshotError([`${options.registry} has no Registry input export ${options.registryExport ?? 'declarations'}`]);
      }
      if (!Array.isArray(registry.groups) || !Array.isArray(registry.spaces)) {
        throw new MenuDeclarationSnapshotError(['Registry input must declare groups and spaces']);
      }
      const groups = new Map(registry.groups.map((group) => [group.id, group.space]));
      const spaces = new Set(registry.spaces.map((space) => space.id));
      const menus = (registry.menus as readonly (Omit<SnapshotMenuInput, 'space'> & { group: string })[]).map((menu) => {
        const space: unknown = groups.get(menu.group);
        if (space === null) return { ...menu, space: '' };
        if (typeof space !== 'string' || space === '' || !spaces.has(space)) {
          throw new MenuDeclarationSnapshotError([`menu ${menu.id}: group ${menu.group} has no declared space`]);
        }
        return { ...menu, space };
      });
      const modules = await Promise.all(options.declarationModules.map((path) => options.load(path)));
      const snapshot = menuDeclarationSnapshot({
        sdkVersion: options.sdkVersion,
        menus,
        permissions: Array.isArray(registry.permissions) ? (registry.permissions as readonly string[]) : [],
        ...collectDeclarations(modules),
      });
      this.emitFile({ type: 'asset', fileName: MENU_DECLARATION_SNAPSHOT_FILE, source: `${JSON.stringify(snapshot, null, 2)}\n` });
    },
  };
}

function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0xd800 && code <= 0xdfff) throw new MenuDeclarationSnapshotError(['declaration text holds a lone surrogate']);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(bytes);
}

