import { isRecord, isRepeatedPageCondition, pageConditionKeys, type MenuMeta, type Text } from '@ap/contracts';

const IDENTIFIER = /^[a-z][a-zA-Z0-9]*$/;
const hasText = (value: Text | undefined) => typeof value?.ko === 'string' && !!value.ko.trim() && typeof value.en === 'string' && !!value.en.trim();

/** Startup-only validation and required-key projection. Undeclared menus keep object identity. */
export function registerPageConditions<T extends Omit<MenuMeta, 'group' | 'permission'>>(menu: T, input: {
  carried: readonly string[];
  endpoints: readonly { id: string; menuId: string }[];
  fail: (message: string) => never;
}): T {
  const declaration = menu.pageConditions;
  if (declaration === undefined) return menu;
  const fail = (message: string): never => input.fail(`Menu "${menu.id}" pageConditions ${message}`);
  const text = (value: Text | undefined, name: string) => { if (!hasText(value)) fail(`${name} needs nonempty ko and en labels`); };
  if (!isRecord(declaration) || !Array.isArray(declaration.categories)) fail('categories must be a list');
  if (menu.pageType !== 'analysis' && menu.pageType !== 'overview') fail(`pageType "${menu.pageType}" cannot declare page conditions`);
  const ids = new Set<string>();
  const keys = new Set<string>();
  const required: { key: string; label: Text }[] = [];
  for (const category of declaration.categories) {
    if (!isRecord(category) || typeof category.id !== 'string' || !IDENTIFIER.test(category.id)) fail('category id must be an identifier');
    if (ids.has(category.id)) fail(`duplicate category id "${category.id}"`);
    ids.add(category.id);
    text(category.label, `category "${category.id}"`);
    if (category.disabled !== undefined) text(category.disabled?.reason, `category "${category.id}" disabled reason`);
    if (category.required !== undefined && category.required !== true) fail(`category "${category.id}" required must be true`);
    const kind = category.kind;
    if (!isRecord(kind) || !['select', 'multi', 'search', 'range', 'date', 'groupedChecks', 'tree'].includes(kind.type)) fail(`category "${category.id}" has an unknown kind`);
    if (kind.type === 'groupedChecks') {
      if (!Array.isArray(kind.lists) || kind.lists.length === 0) fail('groupedChecks lists must be nonempty');
      const lists = new Set<string>();
      for (const list of kind.lists) {
        if (!isRecord(list) || typeof list.id !== 'string' || !list.id.trim() || lists.has(list.id)) fail('groupedChecks list ids must be unique and nonempty');
        lists.add(list.id);
        text(list.label, `list "${list.id}"`);
      }
    }
    if (kind.type === 'tree' && kind.value !== 'leaves' && kind.value !== 'nodes') fail('tree value must be leaves or nodes');
    if (kind.type === 'range') {
      for (const field of ['min', 'max', 'step'] as const) if (kind[field] !== undefined && !Number.isFinite(kind[field])) fail(`range ${field} must be finite`);
      if (kind.min !== undefined && kind.max !== undefined && kind.min > kind.max) fail('range min must not exceed max');
      if (kind.step !== undefined && kind.step <= 0) fail('range step must be positive');
      if (kind.unit !== undefined) text(kind.unit, 'range unit');
    }
    for (const key of pageConditionKeys(category)) {
      if (!menu.pageKeys.includes(key)) fail(`key "${key}" must be a declared page key`);
      if (keys.has(key)) fail(`key "${key}" must belong to exactly one category`);
      keys.add(key);
      if (menu.drill?.levels.some(level => level.key === key)) fail(`key "${key}" is a drill-level key`);
      if (menu.drill?.levels.some(level => level.basisKey === key)) fail(`key "${key}" is a drill basisKey`);
      if (input.carried.includes(key)) fail(`key "${key}" is a carry set key`);
      if (isRepeatedPageCondition(category)) {
        if (!menu.repeatedPageKeys?.includes(key)) fail(`key "${key}" must be in repeatedPageKeys`);
      } else if (menu.repeatedPageKeys?.includes(key)) fail(`key "${key}" must be single-valued`);
      if (category.required) required.push({ key, label: category.label });
    }
    const sources: string[] = [];
    if (kind.type === 'select' || kind.type === 'multi') {
      const options = kind.options;
      if (!isRecord(options) || Object.keys(options).length !== 1) fail('options must have exactly one static or endpoint source');
      if ('static' in options) {
        if (!Array.isArray(options.static)) fail('static options must be a list');
        const values = new Set<string>();
        for (const option of options.static) {
          if (!isRecord(option) || typeof option.value !== 'string' || !option.value.trim() || values.has(option.value)) fail('static option values must be nonempty and unique');
          values.add(option.value);
          text(option.label, 'static option');
        }
        if (kind.type === 'select' && kind.default !== undefined && !values.has(kind.default)) fail('select default must name a static option');
      } else if ('endpoint' in options) sources.push(options.endpoint);
      else fail('options must have exactly one static or endpoint source');
    }
    const absent = (kind as { absent?: unknown }).absent;
    if (absent !== undefined && category.required === true) fail(`category "${category.id}" cannot be both required and absent: 'all' (an absent key is a filled-in everything)`);
    if (absent !== undefined && (absent !== 'all' || (kind.type !== 'multi' && kind.type !== 'groupedChecks'))) fail(`category "${category.id}" absent must be 'all' on multi or groupedChecks`);
    if (kind.type === 'groupedChecks' || kind.type === 'tree') sources.push(kind.source);
    for (const source of sources) if (typeof source !== 'string' || !source.trim() || input.endpoints.filter(endpoint => endpoint.id === source).length !== 1 || !input.endpoints.some(endpoint => endpoint.id === source && endpoint.menuId === menu.id)) fail(`source "${String(source)}" must name a uniquely owned endpoint`);
  }
  if (declaration.sections !== undefined) {
    if (!Array.isArray(declaration.sections)) fail('sections must be a list');
    const sections = new Set<string>();
    const grouped = new Set<string>();
    for (const section of declaration.sections) {
      if (!isRecord(section) || typeof section.id !== 'string' || !section.id.trim() || sections.has(section.id)) fail('section ids must be unique and nonempty');
      sections.add(section.id);
      text(section.label, 'section');
      if (!Array.isArray(section.categories)) fail('section categories must be a list');
      for (const id of section.categories) {
        if (!ids.has(id)) fail(`section names unknown category "${id}"`);
        if (grouped.has(id)) fail(`category "${id}" belongs to multiple sections`);
        grouped.add(id);
      }
    }
  }
  if (!required.length) return menu;
  const query = menu.query;
  if (query?.mode !== 'apply') return fail('required categories need query.mode: apply');
  const declared = query.required?.page ?? [];
  return { ...menu, query: { ...query, required: { ...query.required, page: [...declared.filter(item => !required.some(owned => owned.key === item.key)), ...required] } } };
}
