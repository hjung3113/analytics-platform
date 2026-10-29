// Feature path map (node). The one place the tools learn where the screen apps and packages live; keep in step with
// paths.sh. Values are repository-root relative. The repository root is two levels above this file (ops/platform-api/).
// Feature documents follow platform subject ownership (#1101); historical prototype lint coverage is retained.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FEATURE_OPS = 'ops/platform-api';
export const FEATURE_BACKEND = 'apps/platform-api';
export const FEATURE_FRONTEND = 'apps/feature-screens';
export const FEATURE_SHARED = 'packages/feature-shared';
export const FEATURE_UI = 'packages/feature-ui';
export const FEATURE_DOCS = [
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
export const FEATURE_PACKAGE_DIRS = [FEATURE_BACKEND, FEATURE_FRONTEND, FEATURE_SHARED, FEATURE_UI];
// Where Biome looks: the tool package itself and the docs (design-prototype .jsx is Biome-checked).
// platform-api, feature-shared and feature-ui lint with ESLint since #1102 a, feature-screens since #1102 b (their `lint` scripts).
export const FEATURE_BIOME_SCOPE = [FEATURE_OPS, ...FEATURE_DOCS];

// FEATURE_PATHS_REPO_ROOT is for the fixture tests only (they build a throwaway tree laid out by this map).
export const REPO_ROOT = process.env.FEATURE_PATHS_REPO_ROOT
  ? resolve(process.env.FEATURE_PATHS_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OPS_ROOT = join(REPO_ROOT, FEATURE_OPS);
export const featurePath = (...segments) => join(REPO_ROOT, ...segments);
