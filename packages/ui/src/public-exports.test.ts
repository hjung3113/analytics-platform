import { expect, it } from 'vitest';
import * as ui from './index';
import type { KeyboardShortcutProps, SkeletonBlock, SkeletonBlocksProps, SkeletonRowsProps } from './index';

// Types are erased at runtime, so `Object.keys(ui)` cannot see them: this alias fails `tsc` if one stops being exported.
export type PublicTypes = [KeyboardShortcutProps, SkeletonBlock, SkeletonBlocksProps, SkeletonRowsProps];

// An accidental drop or addition changes the platform's public primitive API (06 §13); change this list on purpose.
const PUBLIC_EXPORTS = [
  'Alert', 'AlertDescription', 'AlertTitle',
  'Badge', 'badgeVariants',
  'Button', 'buttonVariants',
  'Checkbox',
  'DetailPanelSlotProvider',
  'Dialog', 'DialogClose', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogOverlay', 'DialogPortal', 'DialogTitle', 'DialogTrigger',
  'Dot',
  'DropdownMenu', 'DropdownMenuCheckboxItem', 'DropdownMenuContent', 'DropdownMenuGroup', 'DropdownMenuItem', 'DropdownMenuLabel', 'DropdownMenuPortal', 'DropdownMenuRadioGroup', 'DropdownMenuRadioItem', 'DropdownMenuSeparator', 'DropdownMenuShortcut', 'DropdownMenuSub', 'DropdownMenuSubContent', 'DropdownMenuSubTrigger', 'DropdownMenuTrigger',
  'Input',
  'Label',
  'Popover', 'PopoverAnchor', 'PopoverContent', 'PopoverTrigger',
  'RadioGroup', 'RadioGroupItem',
  'Select', 'SelectContent', 'SelectGroup', 'SelectItem', 'SelectLabel', 'SelectScrollDownButton', 'SelectScrollUpButton', 'SelectSeparator', 'SelectTrigger', 'SelectValue',
  'Skeleton',
  'StatusBadge',
  'Tabs', 'TabsContent', 'TabsList', 'TabsTrigger',
  'Tooltip', 'TooltipContent', 'TooltipProvider', 'TooltipTrigger',
  'cn',
  'copyText',
  'isMacPlatform', 'isProductionEnv',
  'prefersReducedMotion',
  'readLocalStorage', 'writeLocalStorage',
  'shortcutLabel',
  'useDetailPanelSlot', 'useDetailPanelSlotHost',
  // Moved from FeedbackOps in #442 (ADR-0046/0047).
  'ActiveFilterBar', 'Callout', 'DatePicker', 'DetailPanelFullscreenContext', 'DetailPanelFullscreenToggle', 'DetailPanelHeader', 'DetailPanelHeaderActions', 'DetailPanelReadingColumn', 'DetailPanelSectionNav', 'StatusBadgeFrame', 'DirtyConfirmation', 'EmptyState', 'FieldLabel', 'FieldList', 'FieldRow', 'ListFilterButton', 'ListShell', 'ListSortButton', 'ListTabs', 'ListToolbar', 'NestedTextBlock', 'PageShell', 'PanelSectionTitle', 'PanelTitleBlock', 'PreviewModal', 'SearchInput', 'ShellHeader', 'ToolbarKicker', 'UndoToast', 'WorkbenchShell', 'useDetailPanelContent',
  // Re-exported sonner for the analysis board's single <Toaster> and toast.custom() undo (#497).
  'Toaster', 'toast', 'TransientOverlayScope',
  // The surface that owns detail-slot registrants is covered but mounted (ADR-0088, #893 893c2).
  'SurfacePauseScope', 'useSurfacePaused',
  // Domain-neutral parts retained from FeedbackOps in #443 (ADR-0046); ADR-0050 returned the coupled parts.
  // Rich content restored by ADR-0052.
  'RichEditor', 'AttachButton', 'RichContentRenderer', 'AttachmentRef', 'Mention',
  'SeverityIndicator', 'ProgressMeter', 'UserAvatar', 'UserChip', 'ObjectRow', 'PermissionBlockedPanel',
  // Opened for FeedbackOps' `@fops/ui` thin re-export (its consumer; ADR-0046). `TabsListBase`/`TabsTriggerBase` are the unwrapped shadcn tabs.
  'AlertDialog', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogContent', 'AlertDialogDescription', 'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogOverlay', 'AlertDialogPortal', 'AlertDialogTitle', 'AlertDialogTrigger',
  'Avatar', 'AvatarFallback', 'AvatarImage',
  'Card', 'CardContent', 'CardDescription', 'CardFooter', 'CardHeader', 'CardTitle',
  'Combobox',
  'MultiCombobox',
  'HoverCard', 'HoverCardContent', 'HoverCardTrigger',
  'Sheet', 'SheetClose', 'SheetContent', 'SheetDescription', 'SheetFooter', 'SheetHeader', 'SheetOverlay', 'SheetPortal', 'SheetTitle', 'SheetTrigger',
  'Textarea', 'ToggleGroup', 'ToggleGroupItem', 'DialogContentBare', 'TabsListBase', 'TabsTriggerBase',
  'KeyboardShortcut', 'SkeletonBlocks', 'SkeletonRows',
  'DIALOG_CONTENT_MOTION', 'POPPER_CONTENT_MOTION', 'SCRIM_MOTION', 'SELECT_CONTENT_MOTION', 'SHEET_CONTENT_MOTION', 'readMotionTiming', 'useListMotion', 'isToastTarget',
];

it('pins the @ap/ui public export names', () => {
  expect(Object.keys(ui).sort()).toEqual([...PUBLIC_EXPORTS].sort());
});
