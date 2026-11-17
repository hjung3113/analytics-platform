import { CONTEXT_FIELDS, type ContextKey, type GlobalContext, type PanelDeclaration, type PanelInputs, type Text } from '@ap/contracts';

type InputKey<I extends PanelInputs> = keyof GlobalContext | NonNullable<I['page']>[number]['key'];
/** Context keys name capabilities; identity reads the real GlobalContext fields behind them
 * (`time` → from/to, the same table as `projectContext`). membershipBasis counts only while
 * a condition applies, as in `projectContext`.
 */
function contextFields(key: ContextKey | 'scopeId', context: Readonly<Record<string, unknown>>): readonly string[] {
  if (key === 'scopeId') return ['scopeId'];
  const fields = CONTEXT_FIELDS[key];
  return key === 'condition' && context.condition != null ? [...fields, 'membershipBasis'] : fields;
}
function project<I extends PanelInputs, C extends Record<string, unknown>>(inputs: I, context: C): Pick<C, Extract<InputKey<I>, keyof C>> {
  const keys = [...(inputs.context ?? []).flatMap(key => contextFields(key, context)), ...(inputs.page ?? []).map(input => input.key)];
  return Object.fromEntries(keys.filter(key => context[key] !== undefined).map(key => [key, context[key]])) as Pick<C, Extract<InputKey<I>, keyof C>>;
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
    const missing = declaration.availability.requires.some(requirement => !requirement.anyOf.some(key => present(context[key])));
    return missing ? declaration.availability.disabledReason : undefined;
  }
  const missing = declaration.queryInputs.page?.filter(input => input.required && !present(context[input.key])) ?? [];
  if (!missing.length) return undefined;
  const names = missing.map(input => labels[input.key] ?? { ko: input.key, en: input.key });
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

