import {
  CONTEXT_FIELDS, emptyGlobal, menuPermissions, missingRequiredContext, normalizeSet,
  type ContextKey, type GlobalContext, type Pair, type PanelBinding, type PanelContextKey, type PanelInputBinding, type Session, type Text,
} from '@ap/contracts';
import { messageText } from '../i18n';
import type { RegisteredPanel } from './panels';
import type { MenuEntry } from './registry';

export type LentPanelBindingValues = {
  context: Readonly<GlobalContext>;
  page?: readonly Pair[];
  values?: Readonly<Record<string, unknown>>;
};

export type LentPanelReason = {
  kind: 'permission' | 'missing-input' | 'unsupported-context' | 'not-registered';
  text: Text;
};
export type LentPanelVerdict = { allowed: true; reason: null } | { allowed: false; reason: LentPanelReason };

/** Names the lending menu and its declared panel title, so the receiver's reason says which panel is withheld. */
function permissionDenied(menu: Text, panel: Text): Extract<LentPanelVerdict, { allowed: false }> {
  const text = { ko: messageText('lentPanelPermission', { menu: menu.ko, panel: panel.ko }).ko, en: messageText('lentPanelPermission', { menu: menu.en, panel: panel.en }).en };
  return Object.freeze({ allowed: false, reason: Object.freeze({ kind: 'permission', text: Object.freeze(text) }) });
}

const UNSUPPORTED_CONTEXT = {
  allowed: false,
  reason: { kind: 'unsupported-context', text: messageText('lentPanelUnsupportedContext') },
} as const satisfies LentPanelVerdict;

export function missingLentPanelInput(key: string): Extract<LentPanelVerdict, { allowed: false }> {
  return {
    allowed: false,
    reason: { kind: 'missing-input', text: messageText('lentPanelMissingInput', { key }) },
  };
}

type ResolvedInputs = { context: GlobalContext; page: Readonly<Record<string, unknown>>; display?: Readonly<Record<string, unknown>> };
type ResolvedLending = Extract<LentPanelVerdict, { allowed: false }> | { allowed: true; reason: null; inputs: ResolvedInputs };

export type RegisteredLentPanel = {
  readonly binding: PanelBinding;
  readonly source: RegisteredPanel;
  readonly permissions: RegisteredPanel['permissions'];
  /** The permission verdict, naming the lending menu and panel. */
  readonly denied: Extract<LentPanelVerdict, { allowed: false }>;
  readonly verdict: (session: Session, values: LentPanelBindingValues) => LentPanelVerdict;
  /** Resolves only after the same checks as verdict. */
  readonly resolve: (session: Session, values: LentPanelBindingValues) => ResolvedLending;
};

function isContextKey(key: string): key is PanelContextKey {
  return key === 'scopeId' || Object.hasOwn(CONTEXT_FIELDS, key);
}
function contextFields(key: PanelContextKey): readonly (keyof GlobalContext)[] {
  return key === 'scopeId' ? ['scopeId'] : CONTEXT_FIELDS[key];
}

function readInput(binding: PanelInputBinding, { context, page, values }: LentPanelBindingValues, menu: MenuEntry): unknown {
  switch (binding.kind) {
    case 'page': {
      const matches = page?.filter(([key]) => key === binding.key).map(([, value]) => value);
      return menu.repeatedPageKeys?.includes(binding.key) ? matches : matches?.[0];
    }
    case 'context': {
      const fields = contextFields(binding.key);
      const [first] = fields;
      if (fields.length === 1 && first !== undefined) return structuredClone(context[first]);
      if (binding.key !== 'scopeId' && missingRequiredContext([binding.key], context).length) return undefined;
      return structuredClone(Object.fromEntries(fields.map(field => [field, context[field]])));
    }
    case 'value':
      return values && Object.hasOwn(values, binding.key) ? values[binding.key] : undefined;
  }
}

function selectionFrom(value: unknown, current: GlobalContext['selection']): string[] | null {
  const ids: unknown[] = Array.isArray(value) ? value : [value];
  if (!ids.length || !ids.every(id => typeof id === 'string')) return null;
  if (current !== null && ids.some(id => !current.includes(id))) return null;
  try {
    return normalizeSet(ids, 'selection');
  } catch {
    // Bad render-time values receive the missing-input verdict instead of becoming request keys.
    return null;
  }
}

function pageInputPresent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(pageInputPresent);
  return value != null && value !== false && (typeof value !== 'string' || value.trim() !== '');
}

const DISPLAY_MAX_DEPTH = 8;

function copyDisplayValue(value: unknown, depth = 0, ancestors: readonly object[] = []): unknown {
  if (depth > DISPLAY_MAX_DEPTH) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.includes(value)) return undefined;

  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return undefined;
  const keys = Reflect.ownKeys(value).filter(key => !array || key !== 'length');
  // JSON arrays are dense and have only indexed values.
  if (array && keys.length !== value.length) return undefined;
  const path = [...ancestors, value];
  const entries: [string, unknown][] = [];
  for (const [index, key] of keys.entries()) {
    if (typeof key !== 'string' || (array && key !== String(index))) return undefined;
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property?.enumerable || !Object.hasOwn(property, 'value')) return undefined;
    const child = copyDisplayValue(property.value, depth + 1, path);
    if (child === undefined) return undefined;
    entries.push([key, child]);
  }
  return Object.freeze(array ? entries.map(([, child]) => child) : Object.fromEntries(entries));
}

function copyContextField<K extends keyof GlobalContext>(target: GlobalContext, source: Readonly<GlobalContext>, key: K) {
  target[key] = structuredClone(source[key]);
}

function registerBinding(menu: MenuEntry, binding: PanelBinding, source: RegisteredPanel, sourceLabel: Text, fail: (message: string) => never): RegisteredLentPanel {
  const requiredContext = new Set<ContextKey>();
  const requiredMappings = new Set<PanelContextKey>();
  const receiverOnlyKeys = new Set<ContextKey>();
  for (const endpoint of source.endpoints) {
    if (typeof endpoint.requiresScope !== 'boolean' || !endpoint.context) {
      fail(`endpoint "${endpoint.id}" must declare requiresScope and context for lending`);
    }
    if (menu.requiresScope === true && !endpoint.requiresScope) fail(`endpoint "${endpoint.id}" must project scopeId for this receiver`);
    if (endpoint.requiresScope) requiredMappings.add('scopeId');
    for (const key of Object.keys(CONTEXT_FIELDS) as ContextKey[]) {
      if (endpoint.context?.[key] === 'apply') requiredMappings.add(key);
      else if (menu.context[key] === 'apply') receiverOnlyKeys.add(key);
    }
    for (const key of endpoint.requiredContext ?? []) requiredContext.add(key);
  }
  if (requiredMappings.has('time')) requiredContext.add('time');
  if (source.queryInputs.context?.includes('scopeId')) requiredMappings.add('scopeId');
  if (requiredMappings.has('scopeId') && menu.requiresScope !== true) fail('receiver must declare requiresScope: true');

  const allowedContext = new Set([...requiredMappings, ...(source.queryInputs.context ?? [])]);
  const allowedPage = new Set(source.queryInputs.page?.map(input => input.key));
  const requiredPage = source.queryInputs.page?.filter(input => input.required).map(input => input.key) ?? [];
  const allowedDisplay = new Set(source.display?.map(input => input.key));
  const validateInput = (input: PanelInputBinding) => {
    if (!input || typeof input.key !== 'string' || !input.key.trim()) fail('input binding needs a nonempty key');
    switch (input.kind) {
      case 'page':
        if (!menu.pageKeys.includes(input.key)) fail(`undeclared receiving page key "${input.key}"`);
        break;
      case 'context':
        if (!isContextKey(input.key)) fail(`unknown receiving Context key "${input.key}"`);
        break;
      case 'value':
        break;
      default:
        fail('input binding kind must be context, page or value');
    }
  };
  const contextBindings = new Map<PanelContextKey, PanelInputBinding>();
  for (const [key, input] of Object.entries(binding.context ?? {})) {
    if (!isContextKey(key) || !allowedContext.has(key)) fail(`unknown source Context query input "${key}"`);
    validateInput(input);
    if (input.kind === 'context' ? input.key !== key : key !== 'selection') {
      fail(`source Context "${key}" must use its matching receiving Context key (only Selection can narrow by page or value)`);
    }
    contextBindings.set(key, input);
  }
  const pageBindings = new Map(Object.entries(binding.page ?? {}));
  for (const [key, input] of pageBindings) {
    if (!allowedPage.has(key)) fail(`unknown source page query input "${key}"`);
    validateInput(input);
  }
  const displayBindings = new Map(Object.entries(binding.display ?? {}));
  for (const [key, input] of displayBindings) {
    if (!allowedDisplay.has(key)) fail(`unknown source display input "${key}"`);
    validateInput(input);
    if (input.kind !== 'value') fail(`source display input "${key}" must use a value binding`);
  }
  for (const key of requiredMappings) {
    if (!contextBindings.has(key)) fail(`missing binding for required query input "${key}"`);
  }
  for (const key of requiredPage) {
    if (!pageBindings.has(key)) fail(`missing binding for required query input "${key}"`);
  }
  const permissions = [...new Set([...menuPermissions(menu), ...source.permissions])];
  const denied = permissionDenied(sourceLabel, source.title);
  const resolve = (session: Session, values: LentPanelBindingValues): ResolvedLending => {
    if (!permissions.every(permission => session.user.permissions.includes(permission))) return denied;
    for (const key of receiverOnlyKeys) {
      // An explicit empty set still constrains the request to zero rows.
      if (CONTEXT_FIELDS[key].some(field => values.context[field] !== null)) return UNSUPPORTED_CONTEXT;
    }
    const context = { ...emptyGlobal };
    for (const [key, input] of contextBindings) {
      if (input.kind === 'context') {
        for (const field of contextFields(key)) copyContextField(context, values.context, field);
      } else {
        // Selection can narrow the receiving set. Scope and the other Context constraints stay in force.
        const selection = selectionFrom(readInput(input, values, menu), values.context.selection);
        if (selection === null) return missingLentPanelInput(key);
        context.selection = selection;
      }
    }
    if (context.condition !== null || context.prcGroups !== null) context.membershipBasis = values.context.membershipBasis;
    if (requiredMappings.has('scopeId') && !context.scopeId) return missingLentPanelInput('scopeId');
    const missing = missingRequiredContext([...requiredContext], context)[0];
    if (missing !== undefined) return missingLentPanelInput(missing);

    const page = Object.fromEntries([...pageBindings].map(([key, input]) => [key, readInput(input, values, menu)]));
    const missingPage = requiredPage.find(key => !pageInputPresent(page[key]));
    if (missingPage !== undefined) return missingLentPanelInput(missingPage);
    const inputs: ResolvedInputs = { context, page };
    if (source.display !== undefined) {
      const display: [string, unknown][] = [];
      for (const [key, input] of displayBindings) {
        try {
          const value = copyDisplayValue(readInput(input, values, menu));
          if (value !== undefined) display.push([key, value]);
        } catch {
          // An unreadable binding (for example a revoked proxy) is unsupported and is omitted.
        }
      }
      inputs.display = Object.freeze(Object.fromEntries(display));
    }
    return { allowed: true, reason: null, inputs };
  };
  return {
    binding, source, permissions, denied, resolve,
    verdict(session, values) {
      const resolved = resolve(session, values);
      return resolved.allowed ? { allowed: true, reason: null } : resolved;
    },
  };
}

export function registerLentPanels(menus: readonly MenuEntry[], panels: readonly RegisteredPanel[], fail: (message: string) => never) {
  const sources = new Map(panels.map(panel => [`${panel.menuId}/${panel.id}`, panel]));
  const labels = new Map(menus.map(menu => [menu.id, menu.label]));
  const bindings = new Map<string, readonly RegisteredLentPanel[]>();
  for (const menu of menus) {
    if (menu.lentPanels === undefined) continue;
    if (!Array.isArray(menu.lentPanels)) fail(`Menu "${menu.id}" lentPanels must be an array`);
    const seen = new Set<string>();
    bindings.set(menu.id, menu.lentPanels.map((binding: PanelBinding) => {
      const invalid = (message: string): never => fail(`Menu "${menu.id}" lent panel "${binding?.source}" ${message}`);
      const source = sources.get(binding?.source) ?? invalid(`has unknown source panel "${binding?.source}"`);
      if (seen.has(binding.source)) invalid('has a duplicate binding');
      seen.add(binding.source);
      if ('outputs' in binding) invalid('cannot bind outputs');
      for (const map of [binding.context, binding.page, binding.display]) {
        if (map !== undefined && (!map || typeof map !== 'object' || Array.isArray(map))) invalid('input bindings must be maps');
      }
      return registerBinding(menu, binding, source, labels.get(source.menuId) ?? invalid(`has a source menu without a label`), invalid);
    }));
  }
  const none: readonly RegisteredLentPanel[] = [];
  return (menuId: string) => bindings.get(menuId) ?? none;
}
