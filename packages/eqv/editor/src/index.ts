export { formatProposalEvidence } from './evidence.js';
export { summarizeFleet, evaluateDrift, type FleetData, type FleetFailure, type FleetNoObservations, type FleetRow, type FleetStatus } from './fleet.js';
export { FleetTable, type FleetTableProps } from './FleetTable.js';
export { InventoryView, type InventoryViewProps } from './InventoryView.js';
export { TemplateProposals, type TemplateProposalsProps } from './TemplateProposals.js';
export { MappingBoard, type MappingBoardProps } from './MappingBoard.js';
export type { BoardInput, BoardRow, BoardStatus, BoardView, RuleFiles, SaveOutcome, SaveScope } from './board.js';
/** The Board's state functions for a host that lays the Board out itself (#1658 platform menu); `MappingBoard` uses the same ones. */
export {
  addPatternRule, applyEdit, applyEdits, applySaveOutcome, buildSavePayload, createBoardState, dirtyScopes, explainRow, paletteOptions, previewPatternRule,
  resolveBoard, suggestPattern, canRedo as canRedoBoard, canUndo as canUndoBoard, isDirty as isBoardDirty, redo as redoBoard, undo as undoBoard,
  type BoardEdit, type BoardState, type PaletteOption, type PatternPreview, type SavePayload,
} from './board.js';
export { describeConflict } from './conflict-text.js';
export {
  conflictHighlight, defaultEffectiveFrom, derivePublishPlan, dryRun, modelDryRunRows, planPublish, shortHash,
  type DiffEntry, type DryRun, type DryRunInput, type ModelDryRunInput, type ModelDryRunRow, type PlanInput, type PublishPlan,
} from './publish.js';
export { DIRTY_REASON, PublishPanel, type PublishPanelProps } from './PublishPanel.js';
export {
  DEFAULT_SNAP, canRedo, canUndo, cancelDrag, createLayoutEdit, dragTo, endDrag, isDirty, markSaved, moveBy, redo, rootDeltaToLocal, rotateBy, setTransform, undo,
  isPortFree, addPhysicalInterface, removePhysicalInterface, removePort, addHoldingSite, removeHoldingSite, addTransferCapability, removeTransferCapability,
  type AddPhysicalInterfaceSpec, type AddTransferCapabilitySpec,
  addComponent, roleForPrimitive, removalImpact, removeComponent, setLabel,
  type AddComponentSpec, type RemovalImpact, type LayoutEditState, type SnapOptions, type TransformPatch,
} from './layout-edit.js';
