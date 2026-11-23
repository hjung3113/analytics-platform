import { CONTEXT_FIELDS, type ContextKey, type GlobalContext, type PanelDeclaration, type PanelInputs, type Text } from '@ap/contracts';
import { parseAnalysisSelection } from '../context/analysisSelectionCodec';

type InputKey<I extends PanelInputs> = keyof GlobalContext | NonNullable<I['page']>[number]['key'];
/** Context keys name capabilities; identity reads the real GlobalContext fields behind them
 * (`time` → from/to, the same table as `projectContext`). membershipBasis counts only while
 * an applied condition or PRC group is set, as in `projectContext`.
 */
function contextFields(key: ContextKey | 'scopeId', context: Readonly<Record<string, unknown>>): readonly string[] {
  if (key === 'scopeId') return ['scopeId'];
  const fields = CONTEXT_FIELDS[key];
  const applies = (key === 'condition' && context.condition != null) || (key === 'prcGroup' && context.prcGroups != null);
  return applies ? [...fields, 'membershipBasis'] : fields;
}
/** Own entries only, so a page key such as `constructor` never reads an inherited property. */
const ownValue = (record: Readonly<Record<string, unknown>>, key: string): unknown => Object.hasOwn(record, key) ? record[key] : undefined;
function pageInputValue(input: NonNullable<PanelInputs['page']>[number], context: Readonly<Record<string, unknown>>): unknown {
  const value = ownValue(context, input.key);
  if (!input.selection) return value;
  // URL-shaped panel context supplies ranges as a single string and sets as repeated strings.
  if (typeof value === 'string') return parseAnalysisSelection('range', [value]) ? value : undefined;
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    const selection = parseAnalysisSelection('set', value);
    if (selection?.shape === 'set') return selection.values;
  }
  return undefined;
}

function project<I extends PanelInputs, C extends Record<string, unknown>>(inputs: I, context: C): Pick<C, Extract<InputKey<I>, keyof C>> {
  const entries = [
    ...(inputs.context ?? []).flatMap(key => contextFields(key, context).map(field => [field, ownValue(context, field)])),
    ...(inputs.page ?? []).map(input => [input.key, pageInputValue(input, context)]),
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as Pick<C, Extract<InputKey<I>, keyof C>>;
}
/** 조회 입력: only declared inputs participate in the panel input identity. */
export function projectQueryInputs<I extends PanelInputs, C extends Record<string, unknown>>(declaration: { readonly queryInputs: I }, context: C) {
  return project(declaration.queryInputs, context);
}
/** 표시 입력: emphasis and local presentation never enter query identity. */
export function projectDisplayInputs<I extends PanelInputs, C extends Record<string, unknown>>(declaration: { readonly displayInputs: I }, context: C) {
  return project(declaration.displayInputs, context);
}
function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '' && value !== false;
}
/** 쓸 수 있는 조건: derive missing required page labels unless overridden.
 * Global Scope/Context readiness remains Kernel-owned.
 */
export function disabledReason(declaration: Pick<PanelDeclaration, 'queryInputs' | 'availability'>, context: Readonly<Record<string, unknown>>, labels: Readonly<Record<string, Text>> = {}): Text | undefined {
  if (declaration.availability) {
    const missing = declaration.availability.requires.some(requirement => !requirement.anyOf.some(key => present(ownValue(context, key))));
    return missing ? declaration.availability.disabledReason : undefined;
  }
  const missing = declaration.queryInputs.page?.filter(input => input.required && !present(pageInputValue(input, context))) ?? [];
  if (!missing.length) return undefined;
  const names = missing.map(input => (Object.hasOwn(labels, input.key) ? labels[input.key] : undefined) ?? { ko: input.key, en: input.key });
  return { ko: names.map(label => label.ko).join(', '), en: names.map(label => label.en).join(', ') };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
/** Pure input identity; the Kernel still owns endpoint/session/permission identity. */
export function panelQueryIdentity<C extends Record<string, unknown>>(declaration: { readonly queryInputs: PanelInputs }, context: C): string {
  return JSON.stringify(canonical(projectQueryInputs(declaration, context)));
}

