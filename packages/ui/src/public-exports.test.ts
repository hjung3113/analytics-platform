import { expect, it } from 'vitest';
import * as ui from './index';

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
  'isMacPlatform', 'isProductionEnv',
  'prefersReducedMotion',
  'shortcutLabel',
  'useDetailPanelSlot', 'useDetailPanelSlotHost',
  // Moved from FeedbackOps in #442 (ADR-0046/0047).
  'ActiveFilterBar', 'Callout', 'DatePicker', 'DetailPanelFullscreenContext', 'DetailPanelFullscreenToggle', 'DetailPanelHeader', 'DetailPanelHeaderActions', 'DetailPanelReadingColumn', 'DetailPanelSectionNav', 'DirtyConfirmation', 'EmptyState', 'FieldLabel', 'FieldRow', 'ListFilterButton', 'ListShell', 'ListSortButton', 'ListTabs', 'ListToolbar', 'NestedTextBlock', 'PageShell', 'PanelSectionTitle', 'PanelTitleBlock', 'PreviewModal', 'SearchInput', 'ShellHeader', 'ToolbarKicker', 'UndoToast', 'WorkbenchShell', 'useDetailPanelContent',
];

it('pins the @ap/ui public export names', () => {
  expect(Object.keys(ui).sort()).toEqual([...PUBLIC_EXPORTS].sort());
});
