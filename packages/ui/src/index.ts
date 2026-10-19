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

export { DetailPanelSlotProvider, useDetailPanelSlot, useDetailPanelSlotHost } from './DetailPanelSlot';

// Layout shells (ADR-0020 — exactly three shells), panel, toolbar, forms, feedback: moved from FeedbackOps (#442, ADR-0046).
// `useDetailPanelContent` is the content registrant of the same slot; FeedbackOps' `DetailPanelSlotContext` is not moved (ADR-0047).
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
export { PanelSectionTitle, type PanelSectionTitleProps } from './panel/PanelSectionTitle';
export { Callout, type CalloutProps, type CalloutTone } from './panel/Callout';
export { DetailPanelHeaderActions, type DetailPanelHeaderActionsProps } from './panel/DetailPanelHeaderActions';
export { DetailPanelSectionNav, type DetailPanelSectionNavProps, type PanelSection } from './panel/DetailPanelSectionNav';

