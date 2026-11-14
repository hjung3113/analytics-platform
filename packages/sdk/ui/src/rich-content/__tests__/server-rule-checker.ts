import type { RichEditorSurface, TipTapDoc } from '../RichEditor';
import { UI_ALLOWLISTS, type AttrSchema } from '../allowlist-local';

// Test-local copy of the two server attr rules (apps/platform-api/src/lib/rich-content/sanitize.ts:154-195),
// which @ap/ui cannot import: a node or mark with no attr definition carries no attrs, and one with a
// definition carries only defined keys and every required key. URL values must pass the server validator.
// Node and mark types must be allowed too.
export function serverRuleViolations(doc: TipTapDoc, surface: RichEditorSurface): string[] {
  const allow = UI_ALLOWLISTS[surface];
  const errors: string[] = [];
  const checkAttrs = (where: string, schemas: Readonly<Record<string, AttrSchema>> | undefined, attrs: unknown) => {
    const keys = Object.keys((attrs as Record<string, unknown> | undefined) ?? {});
    if (!schemas) {
      if (keys.length) errors.push(`${where}: no attrs allowed, found ${keys.join(',')}`);
      return;
    }
    for (const [key, schema] of Object.entries(schemas)) if (schema.required && !keys.includes(key)) errors.push(`${where}: missing ${key}`);
    for (const key of keys) if (!Object.hasOwn(schemas, key)) errors.push(`${where}: attr ${key} not allowed`);
    for (const [key, schema] of Object.entries(schemas)) {
      if (schema.kind !== 'url' || !keys.includes(key)) continue;
      const value = (attrs as Record<string, unknown>)[key];
      try {
        if (typeof value !== 'string' || value.length > schema.maxLen) throw new Error('invalid URL');
        const parsed = new URL(value);
        if (!schema.schemes.has(parsed.protocol) || parsed.username !== '' || parsed.password !== '') throw new Error('invalid URL');
      } catch {
        errors.push(`${where}: invalid ${key}`);
      }
    }
  };
  const walk = (node: TipTapDoc, path: string) => {
    if (!allow.nodes.has(node.type)) errors.push(`${path}: node ${node.type} not allowed`);
    checkAttrs(`${path}(${node.type})`, allow.nodeAttrs[node.type], node.attrs);
    for (const mark of (node.marks ?? []) as Array<{ type: string; attrs?: unknown }>) {
      if (!allow.marks.has(mark.type)) errors.push(`${path}: mark ${mark.type} not allowed`);
      checkAttrs(`${path}.mark(${mark.type})`, allow.markAttrs[mark.type], mark.attrs);
    }
    ((node.content ?? []) as TipTapDoc[]).forEach((child, i) => walk(child, `${path}.${i}`));
  };
  walk(doc, 'doc');
  return errors;
}

