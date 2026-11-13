// Build-time tools (ADR-0156): the menu declaration snapshot emitter and its Vite plugin. A second entry point, not the root, so the
// browser-facing root API carries no build tooling. Pure code: no Vite or Node import.
export {
  MENU_DECLARATION_SNAPSHOT_FILE,
  MENU_DECLARATION_SNAPSHOT_VERSION,
  MenuDeclarationSnapshotError,
  canonicalJson,
  collectDeclarations,
  menuDeclarationSnapshot,
  menuDeclarationSnapshotDigest,
  menuDeclarationSnapshotPlugin,
} from './menu/declaration-snapshot.js';
export type { MenuDeclarationSnapshot, MenuDeclarationSnapshotInput, MenuDeclarationSnapshotPluginOptions, SnapshotAction, SnapshotContext, SnapshotEmitContext, SnapshotEndpoint, SnapshotMenu, SnapshotMenuInput } from './menu/declaration-snapshot.js';
