import { CONTEXT_FIELDS, GLOBAL_KEYS, menuPermissions, type PanelDeclaration, type Permission, type Text } from '@ap/contracts';
import type { MenuEntry } from './registry';
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
export function registerPanels(menu: MenuEntry, fail: (message: string) => never): RegisteredPanel[] {
  if (menu.panels === undefined) return [];
  const error = (message: string): never => fail(`Menu "${menu.id}" panel ${message}`);
  if (!Array.isArray(menu.panels)) error('panels must be an array');
  const ids = new Set<string>();
  const requiredPage = menu.query?.mode === 'apply' ? menu.query.required?.page ?? [] : [];
  const labels: Record<string, Text> = Object.fromEntries([
    ...requiredPage.map(input => [input.key, input.label]),
    ...(menu.drill?.levels ?? []).map(level => [level.key, level.label]),
  ]);
  return menu.panels.map((panel: PanelDeclaration) => {
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
}
