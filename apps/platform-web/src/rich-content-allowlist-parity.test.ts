// @vitest-environment node

import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild } from 'vite';
import { describe, expect, it } from 'vitest';

const UI_ALLOWLIST_SOURCE = new URL('../../../packages/ui/src/rich-content/allowlist-local.ts', import.meta.url);
const FEEDBACKOPS_ALLOWLIST_SOURCE = new URL(
  '../../../products/feedbackops/packages/shared/src/rich-content/allowlist.ts',
  import.meta.url,
);
const UI_FIXTURES_SOURCE = new URL('../../../packages/ui/src/rich-content/fixtures-local.ts', import.meta.url);
const FEEDBACKOPS_FIXTURES_SOURCE = new URL(
  '../../../products/feedbackops/packages/shared/src/rich-content/fixtures.ts',
  import.meta.url,
);

interface AttributeSchema {
  kind: string;
  required: boolean;
  nullable?: boolean;
  maxLen?: number;
  schemes?: ReadonlySet<string>;
}

type AttributeGroups = Readonly<Record<string, Readonly<Record<string, AttributeSchema>>>>;

interface SurfaceAllowlist {
  nodes: ReadonlySet<string>;
  leafNodes: ReadonlySet<string>;
  marks: ReadonlySet<string>;
  nodeAttrs: AttributeGroups;
  markAttrs: AttributeGroups;
  allowedLinkSchemes: ReadonlySet<string>;
  maxTextBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxMarks: number;
}

interface UiAllowlistModule {
  UI_SURFACES: readonly string[];
  UI_ALLOWLISTS: Readonly<Record<string, SurfaceAllowlist>>;
  UI_RICH_CONTENT_EXTENSION_CAPABILITIES: readonly string[];
  UI_SURFACE_EXTENSION_CAPABILITIES: Readonly<Record<string, readonly string[]>>;
}

interface FeedbackOpsAllowlistModule {
  SHARED_SURFACES: readonly string[];
  SHARED_ALLOWLISTS: Readonly<Record<string, SurfaceAllowlist>>;
  SHARED_RICH_CONTENT_EXTENSION_CAPABILITIES: readonly string[];
  SHARED_SURFACE_EXTENSION_CAPABILITIES: Readonly<Record<string, readonly string[]>>;
}

interface UiFixturesModule {
  UI_RICH_CONTENT_ERROR_CODES: readonly string[];
  UI_VALID_RICH_CONTENT_FIXTURES: Readonly<Record<string, unknown>>;
  UI_INVALID_RICH_CONTENT_FIXTURES: Readonly<Record<string, unknown>>;
}

interface FeedbackOpsFixturesModule {
  RICH_CONTENT_ERROR_CODES: readonly string[];
  validDocs: Readonly<Record<string, unknown>>;
  invalidDocs: Readonly<Record<string, unknown>>;
}

interface ParitySources {
  uiAllowlist: UiAllowlistModule;
  feedbackOpsAllowlist: FeedbackOpsAllowlistModule;
  uiFixtures: UiFixturesModule;
  feedbackOpsFixtures: FeedbackOpsFixturesModule;
}

async function loadTypeScriptSource<T>(sourceUrl: URL, label: string): Promise<T> {
  const sourcePath = fileURLToPath(sourceUrl);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Required ${label} source is missing at ${sourcePath}. Check out the FeedbackOps submodule before running this parity test.`,
    );
  }

  const source = readFileSync(sourcePath, 'utf8');
  const { code } = await transformWithEsbuild(source, sourcePath, { loader: 'ts' });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return await import(moduleUrl) as T;
}

async function loadParitySources(): Promise<ParitySources> {
  const [uiAllowlist, feedbackOpsAllowlist, uiFixtures, feedbackOpsFixtures] = await Promise.all([
    loadTypeScriptSource<UiAllowlistModule>(UI_ALLOWLIST_SOURCE, '@ap/ui allowlist'),
    loadTypeScriptSource<FeedbackOpsAllowlistModule>(FEEDBACKOPS_ALLOWLIST_SOURCE, 'FeedbackOps allowlist'),
    loadTypeScriptSource<UiFixturesModule>(UI_FIXTURES_SOURCE, '@ap/ui fixtures'),
    loadTypeScriptSource<FeedbackOpsFixturesModule>(FEEDBACKOPS_FIXTURES_SOURCE, 'FeedbackOps fixtures'),
  ]);

  return { uiAllowlist, feedbackOpsAllowlist, uiFixtures, feedbackOpsFixtures };
}

let paritySourcesPromise: Promise<ParitySources> | undefined;

function getParitySources(): Promise<ParitySources> {
  paritySourcesPromise ??= loadParitySources();
  return paritySourcesPromise;
}

function normalizeAttributes(attributes: AttributeGroups): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, schemas]) => [
        group,
        Object.fromEntries(
          Object.entries(schemas)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, schema]) => [name, {
              kind: schema.kind,
              required: schema.required,
              ...(schema.nullable === undefined ? {} : { nullable: schema.nullable }),
              ...(schema.maxLen === undefined ? {} : { maxLen: schema.maxLen }),
              ...(schema.kind === 'url' ? { schemes: [...(schema.schemes ?? [])].sort() } : {}),
            }]),
        ),
      ]),
  );
}

function normalizeAllowlist(allowlist: SurfaceAllowlist | undefined): unknown {
  if (!allowlist) return undefined;

  return {
    nodes: [...allowlist.nodes].sort(),
    leafNodes: [...allowlist.leafNodes].sort(),
    marks: [...allowlist.marks].sort(),
    nodeAttrs: normalizeAttributes(allowlist.nodeAttrs),
    markAttrs: normalizeAttributes(allowlist.markAttrs),
    allowedLinkSchemes: [...allowlist.allowedLinkSchemes].sort(),
    maxTextBytes: allowlist.maxTextBytes,
    maxDepth: allowlist.maxDepth,
    maxNodes: allowlist.maxNodes,
    maxMarks: allowlist.maxMarks,
  };
}

describe('rich-content allowlist parity with FeedbackOps source', () => {
  it('matches surface names, allowlist rules, and extension-capability tables', async () => {
    const { uiAllowlist, feedbackOpsAllowlist } = await getParitySources();
    const uiBySurface = Object.fromEntries(feedbackOpsAllowlist.SHARED_SURFACES.map((surface) => [
      surface,
      {
        allowlist: normalizeAllowlist(uiAllowlist.UI_ALLOWLISTS[surface]),
        extensionCapabilities: uiAllowlist.UI_SURFACE_EXTENSION_CAPABILITIES[surface],
      },
    ]));
    const feedbackOpsBySurface = Object.fromEntries(feedbackOpsAllowlist.SHARED_SURFACES.map((surface) => [
      surface,
      {
        allowlist: normalizeAllowlist(feedbackOpsAllowlist.SHARED_ALLOWLISTS[surface]),
        extensionCapabilities: feedbackOpsAllowlist.SHARED_SURFACE_EXTENSION_CAPABILITIES[surface],
      },
    ]));

    expect({
      surfaces: uiAllowlist.UI_SURFACES,
      extensionCapabilities: uiAllowlist.UI_RICH_CONTENT_EXTENSION_CAPABILITIES,
      bySurface: uiBySurface,
      extensionCapabilityTable: uiAllowlist.UI_SURFACE_EXTENSION_CAPABILITIES,
    }).toEqual({
      surfaces: feedbackOpsAllowlist.SHARED_SURFACES,
      extensionCapabilities: feedbackOpsAllowlist.SHARED_RICH_CONTENT_EXTENSION_CAPABILITIES,
      bySurface: feedbackOpsBySurface,
      extensionCapabilityTable: feedbackOpsAllowlist.SHARED_SURFACE_EXTENSION_CAPABILITIES,
    });
  });

  it('matches the FeedbackOps valid and invalid fixture corpus and error codes', async () => {
    const { uiFixtures, feedbackOpsFixtures } = await getParitySources();

    expect({
      errorCodes: uiFixtures.UI_RICH_CONTENT_ERROR_CODES,
      validFixtures: uiFixtures.UI_VALID_RICH_CONTENT_FIXTURES,
      invalidFixtures: uiFixtures.UI_INVALID_RICH_CONTENT_FIXTURES,
    }).toEqual({
      errorCodes: feedbackOpsFixtures.RICH_CONTENT_ERROR_CODES,
      validFixtures: feedbackOpsFixtures.validDocs,
      invalidFixtures: feedbackOpsFixtures.invalidDocs,
    });
  });
});
