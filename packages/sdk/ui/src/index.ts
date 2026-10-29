export { Button, buttonVariants, type ButtonProps } from './components/Button';
export { Dot, StatusBadge, type Tone } from './components/StatusBadge';
export * from './components/shadcn/alert';
export * from './components/shadcn/badge';
export * from './components/shadcn/checkbox';
// DialogContentBare stays internal: the platform never exposed it.
export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './components/shadcn/dialog';
export * from './components/shadcn/dropdown-menu';
export * from './components/shadcn/input';
export * from './components/shadcn/label';
export * from './components/shadcn/popover';
export * from './components/shadcn/radio-group';
export * from './components/shadcn/select';
export * from './components/shadcn/skeleton';
export { Tabs, TabsContent } from './components/shadcn/tabs';
export { TabsList, TabsTrigger } from './components/PlatformTabs';
export * from './components/shadcn/tooltip';
export { cn } from './utils/cn';
// First consumer: EChartImpl forces echarts canvas animation off under the OS preference (#297, 06 §26).
export { prefersReducedMotion } from './utils/motion';
export { isProductionEnv } from './utils/isProductionEnv';
export { isMacPlatform, shortcutLabel } from './utils/platform';
export { copyText } from './utils/copyText';
export { readLocalStorage, writeLocalStorage } from './utils/storage';

export { DetailPanelSlotProvider, useDetailPanelSlot, useDetailPanelSlotHost } from './DetailPanelSlot';
export { SurfacePauseScope, useSurfacePaused } from './SurfacePauseScope';

// Layout shells (ADR-0020 — exactly three shells), panel, toolbar, forms, feedback: moved from FeedbackOps (#442, ADR-0046).
// `useDetailPanelContent` is the content registrant of the same slot; the feature screens' `DetailPanelSlotContext` is not moved (ADR-0047).
export { PageShell, type PageShellProps } from './layout/PageShell';
export { ListShell, type ListShellProps } from './layout/ListShell';
export { WorkbenchShell, type WorkbenchShellProps } from './layout/WorkbenchShell';
export { ShellHeader, type ShellHeaderProps } from './layout/ShellHeader';
export { ToolbarKicker, type ToolbarKickerProps } from './layout/ToolbarKicker';
export { useDetailPanelContent } from './layout/useDetailPanelContent';

export { FieldLabel, type FieldLabelProps } from './forms/FieldLabel';
export { DatePicker, type DatePickerProps } from './forms/DatePicker.js';
export { SearchInput, type SearchInputProps } from './forms/SearchInput';
export { DirtyConfirmation, type DirtyConfirmationProps } from './feedback/DirtyConfirmation';
export { UndoToast, type UndoToastProps } from './feedback/UndoToast';
// Kept for consumers that still mount sonner; the analysis board raises its undo notices through the shell toast stack (#886).
export { Toaster, toast } from 'sonner';
export { PreviewModal, type PreviewModalProps } from './feedback/PreviewModal';
export { EmptyState, type EmptyStateProps } from './feedback/EmptyState';

export { ActiveFilterBar, type ActiveFilterBarProps } from './toolbar/ActiveFilterBar.js';
export { ListToolbar, type ListToolbarProps, type ListToolbarTab } from './toolbar/ListToolbar';
export { ListTabs, type ListTabsProps } from './toolbar/ListTabs';
export {
  ListFilterButton,
  type ListFilterButtonProps,
  type FilterCategory,
} from './toolbar/ListFilterButton';
export {
  ListSortButton,
  type ListSortButtonProps,
  type SortOption,
} from './toolbar/ListSortButton';

export { DetailPanelHeader, type DetailPanelHeaderProps, type DetailPanelKind } from './panel/DetailPanelHeader';
export {
  DetailPanelFullscreenContext,
  DetailPanelFullscreenToggle,
  DetailPanelReadingColumn,
  type DetailPanelFullscreenValue,
} from './panel/DetailPanelFullscreenContext';
export { PanelTitleBlock, type PanelTitleBlockProps } from './panel/PanelTitleBlock';
export { NestedTextBlock, type NestedTextBlockProps } from './panel/NestedTextBlock';
export { FieldRow, type FieldRowProps } from './panel/FieldRow';
export { FieldList, type FieldListProps } from './panel/FieldList';
export { PanelSectionTitle, type PanelSectionTitleProps } from './panel/PanelSectionTitle';
export { Callout, type CalloutProps, type CalloutTone } from './panel/Callout';
export { DetailPanelHeaderActions, type DetailPanelHeaderActionsProps } from './panel/DetailPanelHeaderActions';
export { DetailPanelSectionNav, type DetailPanelSectionNavProps, type PanelSection } from './panel/DetailPanelSectionNav';
export { StatusBadgeFrame, type StatusBadgeFrameProps, type StatusBadgeAppearance, type StatusBadgeTone } from './badges/StatusBadgeFrame';

// Domain-neutral feature UI retained in #443 (ADR-0046); domain-coupled parts returned by ADR-0050.
// Rich content (ADR-0046, restored by ADR-0052): editor, renderer and sanitizer. The sanitizer allowlist original is the platform API; `apps/platform-web/src/rich-content-allowlist-parity.test.ts` keeps this copy equal.
export { RichEditor, type RichEditorProps, type RichEditorSurface, type RichEditorToolbarApi, type RichEditorAttachmentResult, type TipTapDoc } from './rich-content/RichEditor';
export { AttachButton, type AttachButtonProps } from './rich-content/toolbar/AttachButton';
export type { Editor as TipTapEditor } from '@tiptap/react';
export { RichContentRenderer, type RichContentRendererProps, type RichContentMode } from './rich-content/RichContentRenderer';
export { AttachmentRef, type AttachmentRefAttrs } from './rich-content/extensions/attachmentRef';
export { Mention, type MentionAttrs } from './rich-content/extensions/mention';
export { SeverityIndicator, type SeverityIndicatorProps, type SeverityEnum } from './indicators/SeverityIndicator';
export { ProgressMeter, type ProgressMeterProps } from './indicators/ProgressMeter';
export { UserAvatar, type UserAvatarProps, type AvatarUser } from './identity/UserAvatar';
export { UserChip, type UserChipProps } from './identity/UserChip';
export { ObjectRow, type ObjectRowProps, type ObjectRowDensity, type ObjectRowSeverity } from './data/ObjectRow';
export { PermissionBlockedPanel, type PermissionBlockedPanelProps, type PermissionState } from './permissions/PermissionBlockedPanel';

// Feature-screen consumption surface (#466, ADR-0046): names the feature screens' `@ap/feature-ui` exports that the platform itself does not use yet.
// Opened because the feature screens are now their consumer (the "open when a consumer appears" condition in AGENTS.md).
export * from './components/shadcn/alert-dialog';
export * from './components/shadcn/avatar';
export * from './components/shadcn/card';
export * from './components/shadcn/combobox';
export { MultiCombobox, type MultiComboboxOption, type MultiComboboxProps } from './components/shadcn/multi-combobox';
export * from './components/shadcn/hover-card';
export * from './components/shadcn/sheet';
export * from './components/shadcn/textarea';
export * from './components/shadcn/toggle-group';
export { DialogContentBare } from './components/shadcn/dialog';
// The shadcn tab list/trigger, unwrapped. `TabsList`/`TabsTrigger` above are the platform selection-marker wrappers (ADR-0023 amended, #340).
export { TabsList as TabsListBase, TabsTrigger as TabsTriggerBase } from './components/shadcn/tabs';
export { KeyboardShortcut, type KeyboardShortcutProps } from './components/KeyboardShortcut';
export { SkeletonBlocks, type SkeletonBlocksProps, type SkeletonBlock } from './components/SkeletonBlocks';
export { SkeletonRows, type SkeletonRowsProps } from './components/SkeletonRows';
export {
  DIALOG_CONTENT_MOTION,
  POPPER_CONTENT_MOTION,
  SCRIM_MOTION,
  SELECT_CONTENT_MOTION,
  SHEET_CONTENT_MOTION,
  readMotionTiming,
} from './utils/motion';
export { useListMotion } from './utils/useListMotion';
export { isToastTarget } from './utils/toast-target';
export { TransientOverlayScope } from './components/TransientOverlayScope';
