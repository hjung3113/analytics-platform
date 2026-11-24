import { isObjectKindShape } from './shapes';
import { CONTEXT_FIELDS, GLOBAL_KEYS, menuPermissions, pageConditionKeys, RETURN_TO_KEY, type PanelDeclaration, type Permission, type Text } from '@ap/contracts';
import type { MenuEntry } from './registry';
import { menuAnalysisSelections } from './analysis-selections';
import { singleValuePageKeyRoles } from './page-key-roles';
import { disabledReason } from './panel-inputs';
import { isIdShape, isPermissionShape } from './shapes';

/** Panel identity stays menu-scoped; permission checks require every derived grant. */
export type RegisteredPanel = PanelDeclaration & {
  readonly menuId: string;
  readonly permissions: readonly (Permission | MenuEntry['permission'])[];
  readonly disabledReason: (context: Readonly<Record<string, unknown>>) => Text | undefined;
};

const textPresent = (text: Text | undefined) => typeof text?.ko === 'string' && text.ko.trim() !== '' && typeof text.en === 'string' && text.en.trim() !== '';

/** Registration only: no query execution, URL writes or reset rules. */
export function registerPanels(menu: MenuEntry, carryKeys: readonly string[], fail: (message: string) => never): RegisteredPanel[] {
  if (menu.panels === undefined) return [];
  const error = (message: string): never => fail(`Menu "${menu.id}" panel ${message}`);
  if (!Array.isArray(menu.panels)) error('panels must be an array');
  const ids = new Set<string>();
  const requiredPage = menu.query?.mode === 'apply' ? menu.query.required?.page ?? [] : [];
  const labels: Record<string, Text> = Object.fromEntries([
    ...requiredPage.map(input => [input.key, input.label]),
    ...(menu.drill?.levels ?? []).map(level => [level.key, level.label]),
  ]);
  const registered = menu.panels.map((panel: PanelDeclaration): RegisteredPanel => {
    if (!panel || !isIdShape(panel.id)) error('id must be nonempty and contain no URL separators');
    if (ids.has(panel.id)) error(`duplicate id "${panel.id}"`);
    ids.add(panel.id);
    const invalid = (message: string): never => error(`"${panel.id}" ${message}`);
    if (!textPresent(panel.title)) invalid('title needs nonempty ko and en');
    if (typeof panel.grain !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(panel.grain)) invalid('grain must match /^[a-z][a-zA-Z0-9]*$/');
    const inputKeys = (field: 'queryInputs' | 'displayInputs') => {
      const inputs = panel[field];
      if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) invalid(`${field} must be an object`);
      if (inputs.context !== undefined && !Array.isArray(inputs.context)) invalid(`${field}.context must be an array`);
      if (inputs.page !== undefined && !Array.isArray(inputs.page)) invalid(`${field}.page must be an array`);
      for (const key of inputs.context ?? []) {
        if (key !== 'scopeId' && !Object.hasOwn(CONTEXT_FIELDS, key)) invalid(`unknown context key "${key}"`);
      }
      for (const input of inputs.page ?? []) {
        if (!input || !menu.pageKeys.includes(input.key)) invalid(`unknown page key "${input?.key}"`);
        if (input.label !== undefined && !textPresent(input.label)) invalid(`${field}.page label needs nonempty ko and en`);
        if (input.required !== undefined && typeof input.required !== 'boolean') invalid(`${field}.page required must be boolean`);
        if (input.selection !== undefined && input.selection !== 'filter' && input.selection !== 'highlight') invalid(`${field}.page selection must be filter or highlight`);
        if (input.selection === 'highlight' && field === 'queryInputs') invalid('highlight requires displayInputs');
      }
      return [...(inputs.context ?? []), ...(inputs.page ?? []).map((input: { key: string }) => input.key)];
    };
    const query = new Set(inputKeys('queryInputs'));
    if (inputKeys('displayInputs').some(key => query.has(key))) invalid('key occurs in both query and display inputs');
    if (panel.display !== undefined && !Array.isArray(panel.display)) invalid('display must be an array');
    const displayKeys = new Set<string>();
    for (const input of panel.display ?? []) {
      if (!input || typeof input.key !== 'string' || !input.key.trim()) invalid('display input needs a nonempty key');
      if (menu.pageKeys.includes(input.key) || menu.drill?.levels.some(level => level.key === input.key)) invalid(`display input "${input.key}" must not be a page key`);
      // A display name equal to a Context query key would let a source rejection of that key pass as an omitted display value.
      if (input.key === 'scopeId' || Object.hasOwn(CONTEXT_FIELDS, input.key)) invalid(`display input "${input.key}" must not be a Context key`);
      if (displayKeys.has(input.key)) invalid(`duplicate display input "${input.key}"`);
      displayKeys.add(input.key);
    }
    if (!Array.isArray(panel.outputs)) invalid('outputs must be an array');
    for (const output of panel.outputs) {
      if (!output || GLOBAL_KEYS.has(output.key) || !menu.pageKeys.includes(output.key)) invalid(`output "${output?.key}" must be a page key`);
      if (typeof output.action !== 'string' || !output.action.trim()) invalid('output action must be nonempty');
      if (output.selection !== undefined) {
        const { shape, dimension, drillLevel, objectKind } = output.selection ?? {};
        if (shape !== 'set' && shape !== 'range') invalid('output selection shape must be set or range');
        if (typeof dimension !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(dimension)) invalid('output selection dimension must match /^[a-z][a-zA-Z0-9]*$/');
        if (drillLevel !== undefined && !menu.drill?.levels.some(level => level.key === drillLevel)) invalid(`output selection drillLevel "${drillLevel}" must name a declared drill level`);
        if (objectKind !== undefined && !isObjectKindShape(objectKind)) invalid('output selection objectKind must match /^[a-z][a-zA-Z0-9]*$/');
      }
    }
    if (!Array.isArray(panel.endpoints)) invalid('endpoints must be an array');
    for (const endpoint of panel.endpoints) {
      if (!endpoint || endpoint.menuId !== menu.id) invalid('endpoint must be owned by this menu');
      if (typeof endpoint.id !== 'string' || !endpoint.id.trim() || !isPermissionShape(endpoint.permission)) invalid('endpoint needs id and permission');
    }
    if (panel.availability !== undefined) {
      const availability = panel.availability;
      if (!availability || !Array.isArray(availability.requires) || availability.requires.some((group: { anyOf: readonly string[] }) => !group || !Array.isArray(group.anyOf) || group.anyOf.length === 0 || group.anyOf.some((key: string) => typeof key !== 'string' || !key.trim()))) invalid('availability requires AND groups of nonempty anyOf keys');
      if (!textPresent(availability.disabledReason)) invalid('availability disabledReason needs nonempty ko and en');
    }
    return { ...panel, menuId: menu.id, permissions: [...new Set([...menuPermissions(menu), ...panel.endpoints.map((endpoint: PanelDeclaration['endpoints'][number]) => endpoint.permission)])], disabledReason: context => disabledReason(panel, context, labels) };
  });
  validateAnalysisSelections(menu, carryKeys, error);
  return registered;
}

function validateAnalysisSelections(menu: MenuEntry, carryKeys: readonly string[], error: (message: string) => never) {
  const channels = menuAnalysisSelections(menu);
  for (const panel of menu.panels ?? []) {
    for (const { key, selection } of [...panel.queryInputs.page ?? [], ...panel.displayInputs.page ?? []]) {
      const channel = channels.get(key);
      if (selection !== undefined && !channel) error(`"${panel.id}" selection input "${key}" needs a matching output`);
      if (!channel) continue;
      if (channel.writers.some(writer => writer.panelId === panel.id)) error(`selection key "${key}" cannot be read by a panel with its own output`);
      if (selection === undefined) error(`"${panel.id}" input "${key}" must declare selection`);
    }
  }
  if (!channels.size) return;
  const reserved = [
    ['returnTo', [RETURN_TO_KEY]],
    ...singleValuePageKeyRoles(menu),
    ['pageConditions', menu.pageConditions?.categories.flatMap(pageConditionKeys) ?? []],
    ['subjectPageKeys', Object.values(menu.subjectPageKeys ?? {})],
    ['hiddenPageKeys', menu.hiddenPageKeys ?? []],
    ['a carry set page key', carryKeys],
  ] as const;
  for (const [key, { shape, dimension, label, writers }] of channels) {
    const invalid = (message: string): never => error(`selection key "${key}" ${message}`);
    for (const { selection } of writers) {
      if (!selection) invalid('must declare selection on every output');
      if (selection?.shape !== shape || selection.dimension !== dimension) invalid('writers must agree on shape and dimension');
      if (selection?.label !== undefined) {
        if (!textPresent(selection.label)) invalid('label must have non-empty ko/en text');
        if (selection.label.ko !== label?.ko || selection.label.en !== label.en) invalid('writers must agree on label');
      }
    }
    if (Boolean(menu.repeatedPageKeys?.includes(key)) !== (shape === 'set')) invalid(`shape "${shape}" conflicts with repeatedPageKeys`);
    if (!menu.contextResetKeys?.includes(key)) invalid('must be in contextResetKeys');
    const role = reserved.find(([, keys]) => keys.some(other => other === key));
    if (role) invalid(`conflicts with ${role[0]}`);
  }
}
