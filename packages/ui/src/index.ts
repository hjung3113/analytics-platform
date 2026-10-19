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
