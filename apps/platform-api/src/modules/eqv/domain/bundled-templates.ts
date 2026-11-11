// The EV Templates the package ships, as the rows `eqv.bundledTemplates` answers (#1658 Sample Window·Fleet PR). `@eqv/core` owns the id list
// (`BUNDLED_TEMPLATE_IDS`); the documents are a generated copy (`bundled-templates-data.ts`) that `__tests__/bundled-templates.test.ts`
// keeps equal to the asset files. Parsed once: the rows are never modified.
import { BUNDLED_TEMPLATE_IDS } from '@eqv/core';

import { BUNDLED_TEMPLATE_JSON } from './bundled-templates-data.js';

export interface BundledTemplateRow {
  templateId: string;
  name: string;
  document: Record<string, unknown>;
}

let rows: BundledTemplateRow[] | null = null;

export function bundledTemplateRows(): BundledTemplateRow[] {
  rows ??= [...BUNDLED_TEMPLATE_IDS].sort().map((templateId) => {
    const json = BUNDLED_TEMPLATE_JSON[templateId];
    if (json === undefined) throw new Error(`bundled template ${templateId} has no document`);
    const document = JSON.parse(json) as Record<string, unknown>;
    return { templateId, name: String(document.name), document };
  });
  return rows;
}
