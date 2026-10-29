// FeedbackOps path map (node). The one place the tools learn where the FO apps and packages live; keep in step with
// paths.sh. Values are repository-root relative. The repository root is two levels above this file (ops/platform-api/).
// Feature documents follow platform subject ownership (#1101); historical prototype lint coverage is retained.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FO_OPS = 'ops/platform-api';
export const FO_BACKEND = 'apps/platform-api';
export const FO_FRONTEND = 'apps/feature-screens';
export const FO_SHARED = 'packages/feature-shared';
export const FO_UI = 'packages/feature-ui';
export const FO_DOCS = [
  'docs/product/features',
  'docs/architecture/platform-api',
  'docs/design/features',
  'docs/design/history/feedbackops-prototype',
  'docs/user-guide/features',
  'docs/user-guide/history/feedbackops',
  'docs/adr/history/feedbackops',
  'docs/integration/history/feedbackops-local-development.md',
  'docs/integration/feature-code-index.md',
  'docs/agents/feature-implementation.md',
];
export const FO_PACKAGES = [FO_BACKEND, FO_FRONTEND, FO_SHARED, FO_UI];
// Where Biome looks: the tool package itself, the apps and packages, and the docs (design-prototype .jsx is Biome-checked).
export const FO_BIOME_SCOPE = [FO_OPS, ...FO_PACKAGES, ...FO_DOCS];

// FO_PATHS_REPO_ROOT is for the fixture tests only (they build a throwaway tree laid out by this map).
export const REPO_ROOT = process.env.FO_PATHS_REPO_ROOT
  ? resolve(process.env.FO_PATHS_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OPS_ROOT = join(REPO_ROOT, FO_OPS);
export const foPath = (...segments) => join(REPO_ROOT, ...segments);
