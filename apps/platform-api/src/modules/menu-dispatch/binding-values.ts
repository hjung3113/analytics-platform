import type { Binding, ParamType } from './bundle/bindings.js';
import type { Call } from './bundle/calls.js';
import type { EndpointHandlerArgs, ParamsJudgment } from './types.js';

/** Step 2: values never appear in a refusal. A bound param must be present. */
export function validateParamValues(types: Readonly<Record<string, ParamType>>, params: Record<string, unknown>): ParamsJudgment {
  for (const [key, rule] of Object.entries(types)) {
    const value = params[key];
    let valid: boolean;
    switch (rule.type) {
      case 'string': valid = typeof value === 'string' && (rule.maxLength === undefined || value.length <= rule.maxLength); break;
      case 'number': valid = typeof value === 'number' && Number.isFinite(value); break;
      case 'boolean': valid = typeof value === 'boolean'; break;
      case 'string[]': valid = Array.isArray(value) && (rule.maxItems === undefined || value.length <= rule.maxItems) && value.every((item) => typeof item === 'string' && (rule.maxLength === undefined || item.length <= rule.maxLength)); break;
    }
    if (!valid || (rule.enum !== undefined && !(Array.isArray(value) ? value : [value]).every((item) => rule.enum?.includes(item)))) {
      return { ok: false, message: 'Invalid declared endpoint params' };
    }
  }
  return { ok: true };
}
export function bindingValue(binding: Binding, args: EndpointHandlerArgs, site: string | null, rooms: readonly string[]): unknown {
  if (typeof binding !== 'string') return structuredClone(binding.const);
  if (binding === 'scope.site') return site;
  if (binding === 'scope.rooms') return [...rooms];
  return binding.startsWith('context.') ? args.context[binding.slice(8)] : args.params[binding.slice(7)];
}
export const sameBinding = (left: Binding, right: Binding): boolean => typeof left === 'string' ? left === right : JSON.stringify(left) === JSON.stringify(right);

export function resolveBindings(call: Call, args: EndpointHandlerArgs, site: string | null, rooms: readonly string[], override?: { binding: Binding; value: unknown }): Record<string, Record<string, unknown>> {
  const sections = 'statement' in call ? { params: call.params } : 'procedure' in call ? { args: call.args } : call.mode === 'mapped' ? { pathParams: call.pathParams ?? {}, query: call.query ?? {}, body: call.body ?? {} } : {};
  return Object.fromEntries(Object.entries(sections).map(([section, bindings]) => [section, Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key,
    override && sameBinding(binding, override.binding) ? override.value : bindingValue(binding, args, site, rooms),
  ]))]));
}
