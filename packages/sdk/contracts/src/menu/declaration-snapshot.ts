// Menu declaration snapshot (#1900, ADR-0156): the menu-owned half of what the core server serves — menus, the app's
// permission vocabulary, endpoint and action declarations — as one JSON file the app assembly build writes. The core
// server refuses a declaration bundle whose menu-owned fields differ from it. Pure: no Node, DOM or Vite import; the
// build hands this module the loaded Registry input and declaration modules. The zod schema and JSON Schema of the
// file are `menuDeclarationSnapshotSchema` in `@ap/contract-schemas`; its tests pin this emitter to that schema.
import type { AnyActionSpec } from '../adapter/action.js';
import type { AnyEndpointSpec } from './menu-query.js';
import type { Capability, ContextKey } from './menu.js';
import type { AssessmentKind } from '../adapter/response.js';

export const MENU_DECLARATION_SNAPSHOT_VERSION = 1 as const;
/** The file name the app assembly build writes into its output folder. */
export const MENU_DECLARATION_SNAPSHOT_FILE = 'menu-declarations.snapshot.json';

export type SnapshotContext = Partial<Record<ContextKey, Exclude<Capability, 'unsupported'>>>;

export type SnapshotMenu = { id: string; permission: string; requiresScope: boolean; context: SnapshotContext };
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

/** What the emitter reads of a menu: the Registry input's menu entries are structurally this. */
export type SnapshotMenuInput = { readonly id: string; readonly permission: string; readonly requiresScope: boolean; readonly context: Readonly<Partial<Record<ContextKey, Capability>>> };

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
  unique('endpoint', input.endpoints.map((spec) => spec.id));
  unique('action', (input.actions ?? []).map((spec) => spec.id));
  if (problems.length > 0) throw new MenuDeclarationSnapshotError(problems);

  const body: Omit<MenuDeclarationSnapshot, 'digest'> = {
    schemaVersion: MENU_DECLARATION_SNAPSHOT_VERSION,
    sdkVersion: input.sdkVersion,
    menus: input.menus.map((menu) => ({ id: menu.id, permission: menu.permission, requiresScope: menu.requiresScope, context: applied(menu.context) })).sort(byId),
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
      const modules = await Promise.all(options.declarationModules.map((path) => options.load(path)));
      const snapshot = menuDeclarationSnapshot({
        sdkVersion: options.sdkVersion,
        menus: registry.menus as readonly SnapshotMenuInput[],
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

const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** FIPS 180-4 SHA-256 (contracts has no crypto import; the server recomputes with node:crypto and a test pins equality). */
function sha256Hex(message: Uint8Array): string {
  const length = message.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] ?? 0;
      const b = w[i - 2] ?? 0;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0] ?? 0, h[1] ?? 0, h[2] ?? 0, h[3] ?? 0, h[4] ?? 0, h[5] ?? 0, h[6] ?? 0, h[7] ?? 0];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((value, i) => { h[i] = ((h[i] ?? 0) + value) >>> 0; });
  }
  return Array.from(h, (word) => word.toString(16).padStart(8, '0')).join('');
}
