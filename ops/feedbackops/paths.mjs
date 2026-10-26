// FeedbackOps path map (node). The one place the tools learn where the FO apps and packages live; keep in step with
// paths.sh. Values are repository-root relative. The repository root is two levels above this file (ops/feedbackops/).
// Step 713p2 moves the apps and packages by changing the FO_* values (and paths.sh) only.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FO_OPS = 'ops/feedbackops';
export const FO_BACKEND = 'products/feedbackops/apps/backend';
export const FO_FRONTEND = 'products/feedbackops/apps/frontend';
export const FO_SHARED = 'products/feedbackops/packages/shared';
export const FO_UI = 'products/feedbackops/packages/ui';
export const FO_DOCS = 'products/feedbackops/docs';
export const FO_PACKAGES = [FO_BACKEND, FO_FRONTEND, FO_SHARED, FO_UI];
// Where Biome looks: the tool package itself, the apps and packages, and the docs (design-prototype .jsx is Biome-checked).
export const FO_BIOME_SCOPE = [FO_OPS, ...FO_PACKAGES, FO_DOCS];

// The allowlist (scripts/gates/frontend-biome-allowlist.txt) still names files relative to the old FeedbackOps root;
// 713p2 changes this prefix together with the allowlist lines.
export const FO_ALLOWLIST_PREFIX = 'products/feedbackops/';

// FO_PATHS_REPO_ROOT is for the fixture tests only (they build a throwaway tree laid out by this map).
export const REPO_ROOT = process.env.FO_PATHS_REPO_ROOT
  ? resolve(process.env.FO_PATHS_REPO_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OPS_ROOT = join(REPO_ROOT, FO_OPS);
export const foPath = (...segments) => join(REPO_ROOT, ...segments);
