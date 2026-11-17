import { Columns3 } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useMessages } from '@ap/kernel';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@ap/ui';
import { DEV_MESSAGES } from './messages';

const ColumnGroupsExampleBody = lazy(() => import('./ColumnGroupsExampleBody'));

/** Mock assembly only, matching PanelCatalog's lazy dialog boundary. */
export function ColumnGroupsExample() {
  const m = useMessages(DEV_MESSAGES);
  return <Dialog>
    <DialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={m('columnGroupsExample')} title={m('columnGroupsExample')}><Columns3 className="size-4" aria-hidden /></Button></DialogTrigger>
    <DialogContent className="max-w-7xl">
      <DialogHeader><DialogTitle>{m('columnGroupsExample')}</DialogTitle><DialogDescription>{m('columnGroupsDescription')}</DialogDescription></DialogHeader>
      <Suspense fallback={null}><ColumnGroupsExampleBody /></Suspense>
    </DialogContent>
  </Dialog>;
}
