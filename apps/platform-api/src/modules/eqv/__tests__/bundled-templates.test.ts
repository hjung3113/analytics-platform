import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BUNDLED_TEMPLATE_IDS, layoutDocumentSchema } from '@eqv/core';
import { describe, expect, it } from 'vitest';

import { defined } from '../../../test-support/defined.js';
import { bundledTemplateRows } from '../domain/bundled-templates.js';

const asset = (id: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../../../packages/eqv/assets/templates/${id}.template.json`, import.meta.url)), 'utf8'));

describe('eqv.bundledTemplates rows (#1658 Sample Window·Fleet PR)', () => {
  it('has one row per id @eqv/core lists, in id order', () => {
    expect(bundledTemplateRows().map((r) => r.templateId)).toEqual([...BUNDLED_TEMPLATE_IDS].sort());
  });

  it.each(BUNDLED_TEMPLATE_IDS.map((id) => [id]))('%s: the document equals the asset file, is a valid template, and the row name is its name', (id) => {
    const row = defined(bundledTemplateRows().find((r) => r.templateId === id), id);
    expect(row.document, `${id} differs from its asset: run pnpm --filter @ap/platform-api gen:bundled-templates`).toEqual(asset(id));
    expect(row.name).toBe((row.document as { name: string }).name);
    const parsed = layoutDocumentSchema.safeParse(row.document);
    expect(parsed.success, id).toBe(true);
    expect((row.document as { kind: string; id: string }).kind).toBe('template');
    expect((row.document as { id: string }).id).toBe(id);
  });
});
