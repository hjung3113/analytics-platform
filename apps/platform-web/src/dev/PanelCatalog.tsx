import { LayoutDashboard } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useMessages } from '@ap/kernel';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@ap/ui';
import { DEV_MESSAGES } from './messages';

const PanelCatalogBody = lazy(() => import('./PanelCatalogBody'));

/** Mock assembly only. The dialog body (table) loads when the dialog opens. */
export function PanelCatalog() {
  const m = useMessages(DEV_MESSAGES);
  return <Dialog>
    <DialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={m('panelCatalog')} title={m('panelCatalog')}><LayoutDashboard className="size-4" aria-hidden /></Button></DialogTrigger>
    <DialogContent className="max-w-7xl">
      <DialogHeader><DialogTitle>{m('panelCatalog')}</DialogTitle><DialogDescription>{m('panelCatalogDescription')}</DialogDescription></DialogHeader>
      <Suspense fallback={null}><PanelCatalogBody /></Suspense>
    </DialogContent>
  </Dialog>;
}
