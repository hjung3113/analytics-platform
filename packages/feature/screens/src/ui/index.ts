// Feature-owned exports only. SDK-owned parts (primitives, panel/toolbar/forms/feedback/layout shells,
// rich content, ...) are imported from `@ap/ui` directly (ADR-0090, #713).
// Feature names for @ap/ui parts: the unwrapped shadcn tab list/trigger (the platform `TabsList` adds a selection marker).
export { TabsListBase as TabsList, TabsTriggerBase as TabsTrigger } from '@ap/ui';

export {
  ManagedSystemPicker,
  type ManagedSystemPickerProps,
  type PickerOption,
} from './components/ManagedSystemPicker.js';
export {
  AnalyticsAreaPicker,
  type AnalyticsAreaPickerProps,
} from './components/AnalyticsAreaPicker.js';
// Re-export the TipTap Editor type so feature packages can type render-prop callbacks
// (e.g. RichEditor toolbar) without depending on @tiptap/react directly.
export type { Editor as TipTapEditor } from '@tiptap/react';
export { useDetailPanelSlot } from './layout/useDetailPanelSlot';
export {
  SeverityBadge,
  SEVERITY_LABELS,
  type SeverityBadgeProps,
} from './badges/SeverityBadge';
export {
  ReporterStatusBadge,
  type ReporterStatusBadgeProps,
  type ReporterFacingStatusEnum,
} from './badges/ReporterStatusBadge';
export {
  InternalTaskBadge,
  type InternalTaskBadgeProps,
  type InternalTaskStatusEnum,
} from './badges/InternalTaskBadge';
export { UnassignedBadge, type UnassignedBadgeProps } from './badges/UnassignedBadge';
export { ManagedSystemPill, type ManagedSystemPillProps } from './badges/ManagedSystemPill';
export { ManagedSystemMark, type ManagedSystemMarkProps } from './badges/ManagedSystemMark';
export {
  managedSystemMarkColor,
  managedSystemMarkToken,
  type ManagedSystemMarkToken,
} from './badges/managed-system-mark.js';
export { OutlineBadge, type OutlineBadgeProps } from './badges/OutlineBadge';
export {
  EntityIconBadge,
  type EntityIconBadgeProps,
  type EntityIconType,
  ENTITY_ICON_MAP,
} from './badges/EntityIconBadge';
// Entity (Slice 3 #20 placeholder; Slice 4 wires real node resolution)
export {
  LinkedEntityTrail,
  type LinkedEntityTrailProps,
  type EntityNodeRef,
} from './entity/LinkedEntityTrail';
