// PLAN-22 C9 fix — UI-local copy of the shared rich-content allowlist.
//
// ADR-0016 forbids `@ap/ui` from importing `@ap/feature-shared`. The shared
// allowlist (`packages/feature-shared/src/rich-content/allowlist.ts`) is therefore
// duplicated here verbatim so the FE render-time defence-in-depth sanitizer
// can run without crossing the boundary.
//
// Parity with `@ap/feature-shared` is enforced by:
//   - `apps/platform-api/src/lib/rich-content/__tests__/drift-vs-shared.test.ts`
//     (backend ↔ shared)
//   - `packages/sdk/ui/src/rich-content/__tests__/allowlist-drift.test.ts`
//     (UI ↔ inline fixture mirroring shared)
//
// If you change values in either side, update both and rerun both drift tests.
// Do NOT add an import of @ap/feature-shared to this package — the boundary script
// (`scripts/check-boundaries.mjs`) walks `*.ts` and `*.test.ts` and will fail.

// ── Surface enum ─────────────────────────────────────────────────────────────

export const UI_SURFACES = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
] as const;
export type UISurface = (typeof UI_SURFACES)[number];

// ── AttrSchema ───────────────────────────────────────────────────────────────

export type AttrSchema =
  | { kind: 'uuid'; required: boolean }
  | { kind: 'url'; schemes: ReadonlySet<string>; maxLen: number; required: boolean }
  | { kind: 'string'; maxLen: number; nullable: boolean; required: boolean }
  | { kind: 'int'; min: number; max: number; required: boolean }
  | { kind: 'boolean'; required: boolean }
  | { kind: 'enum'; values: readonly string[]; nullable?: boolean; required: boolean }
  | { kind: 'intArray'; min: number; max: number; maxLen: number; required: boolean };

// ── SurfaceAllowlist ─────────────────────────────────────────────────────────

// DoS caps — see surface-allowlists.ts header for rationale.
export interface UISurfaceAllowlist {
  nodes: ReadonlySet<string>;
  leafNodes: ReadonlySet<string>;
  marks: ReadonlySet<string>;
  nodeAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
  markAttrs: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>;
  allowedLinkSchemes: ReadonlySet<string>;
  maxTextBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxMarks: number;
}

export type UIAllowlists = Readonly<Record<UISurface, UISurfaceAllowlist>>;

// ── Surface extension capabilities ──────────────────────────────────────────

export const UI_RICH_CONTENT_EXTENSION_CAPABILITIES = [
  'bold',
  'italic',
  'underline',
  'code',
  'list',
  'link',
  'mention',
  'attachmentRef',
  'heading', 'strike', 'highlight', 'color', 'blockquote', 'horizontalRule',
  'codeBlock', 'taskList', 'table', 'details', 'tableOfContents', 'image',
] as const;

export type UIRichContentExtensionCapability =
  (typeof UI_RICH_CONTENT_EXTENSION_CAPABILITIES)[number];

export type UISurfaceExtensionCapabilities = Readonly<
  Record<UISurface, readonly UIRichContentExtensionCapability[]>
>;

// Storage keys, never CSS values. The SDK mirror supplies the token mapping.
export const RICH_CONTENT_PALETTE = ['default', 'info', 'success', 'warning', 'danger'] as const;
export const RICH_CONTENT_LANGUAGES = ['javascript', 'typescript', 'json', 'sql', 'python', 'bash', 'java'] as const;
export const RICH_CONTENT_IMAGE_WIDTH = { min: 80, max: 4096 } as const;

// ── UI scheme sets ───────────────────────────────────────────────────────

const HTTP_ONLY = new Set(['http:', 'https:']);

// ── UI attr schemas ──────────────────────────────────────────────────────

const uuidRequired: AttrSchema = { kind: 'uuid', required: true };

const attachmentRefAttrs: Readonly<Record<string, AttrSchema>> = {
  id: uuidRequired,
};

const linkMarkAttrs: Readonly<Record<string, AttrSchema>> = {
  href: { kind: 'url', schemes: HTTP_ONLY, maxLen: 2048, required: true },
};

const cellAttrs: Readonly<Record<string, AttrSchema>> = {
  colspan: { kind: 'int', min: 1, max: 20, required: false },
  rowspan: { kind: 'int', min: 1, max: 20, required: false },
  colwidth: { kind: 'intArray', min: 25, max: 4096, maxLen: 20, required: false },
};
const paletteAttr: AttrSchema = { kind: 'enum', values: RICH_CONTENT_PALETTE, required: false };

// ── Surface definitions ──────────────────────────────────────────────────────

export const UI_ALLOWLISTS: UIAllowlists = {
  'voc-description': {
    nodes: new Set([
      'doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem', 'attachmentRef',
      'heading', 'blockquote', 'horizontalRule', 'codeBlock', 'taskList', 'taskItem',
      'table', 'tableRow', 'tableHeader', 'tableCell', 'details', 'detailsSummary', 'detailsContent',
      'tableOfContents', 'image',
    ]),
    leafNodes: new Set(['attachmentRef', 'image', 'horizontalRule', 'tableOfContents']),
    marks: new Set(['bold', 'italic', 'underline', 'code', 'link', 'strike', 'highlight', 'textStyle']),
    nodeAttrs: {
      attachmentRef: attachmentRefAttrs,
      image: { id: uuidRequired, width: { kind: 'int', ...RICH_CONTENT_IMAGE_WIDTH, required: false } },
      heading: { level: { kind: 'int', min: 1, max: 3, required: false } },
      codeBlock: { language: { kind: 'enum', values: RICH_CONTENT_LANGUAGES, nullable: true, required: false } },
      taskItem: { checked: { kind: 'boolean', required: false } },
      tableCell: cellAttrs,
      tableHeader: cellAttrs,
      details: { open: { kind: 'boolean', required: false } },
    },
    markAttrs: { link: linkMarkAttrs, highlight: { color: paletteAttr }, textStyle: { color: paletteAttr } },
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },

  'public-update': {
    nodes: new Set(['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem']),
    leafNodes: new Set<string>(),
    marks: new Set(['bold', 'italic']),
    nodeAttrs: {},
    markAttrs: {},
    allowedLinkSchemes: new Set<string>(),
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },

  'reporter-reply': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'bulletList', 'orderedList', 'listItem',
      'attachmentRef',
    ]),
    leafNodes: new Set(['attachmentRef']),
    marks: new Set(['bold', 'italic', 'link']),
    nodeAttrs: { attachmentRef: attachmentRefAttrs },
    markAttrs: { link: linkMarkAttrs },
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },

  'internal-comment': {
    nodes: new Set([
      'doc', 'paragraph', 'text',
      'codeBlock',
      'bulletList', 'orderedList', 'listItem',
      'mention', 'attachmentRef',
    ]),
    leafNodes: new Set(['mention', 'attachmentRef']),
    marks: new Set(['bold', 'italic', 'code', 'link']),
    nodeAttrs: {
      attachmentRef: attachmentRefAttrs,
      mention: { actor_id: uuidRequired },
      codeBlock: {
        language: { kind: 'string', maxLen: 32, nullable: true, required: false },
      },
    },
    markAttrs: { link: linkMarkAttrs },
    allowedLinkSchemes: HTTP_ONLY,
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },
};

export const UI_SURFACE_EXTENSION_CAPABILITIES: UISurfaceExtensionCapabilities = {
  'voc-description': ['bold', 'italic', 'underline', 'code', 'list', 'link', 'attachmentRef',
    'heading', 'strike', 'highlight', 'color', 'blockquote', 'horizontalRule',
  'codeBlock', 'taskList', 'table', 'details', 'tableOfContents', 'image'],
  'reporter-reply': ['bold', 'italic', 'link', 'attachmentRef'],
  'public-update': ['bold', 'italic', 'list'],
  'internal-comment': ['bold', 'italic', 'code', 'list', 'link', 'mention', 'attachmentRef'],
};

export function getExtensionsForSurface(
  surface: UISurface,
): readonly UIRichContentExtensionCapability[] {
  return UI_SURFACE_EXTENSION_CAPABILITIES[surface];
}
