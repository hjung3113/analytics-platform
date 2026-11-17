import { LayoutDashboard } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n, useMessages, usePlatform, type RegisteredPanel } from '@ap/kernel';
import type { PanelInputs } from '@ap/contracts';
import { PlatformDataTable, type PlatformColumn } from '@ap/components';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@ap/ui';
import { DEV_MESSAGES } from './messages';

const inputNames = (inputs: PanelInputs) => [...(inputs.context ?? []), ...(inputs.page ?? []).map(input => input.key)].join(', ');
const panelId = (panel: RegisteredPanel) => `${panel.menuId}/${panel.id}`;

/** Mock assembly only. The catalog reads the mounted Registry, with no parallel declarations. */
export function PanelCatalog() {
  const { registry } = usePlatform();
  const { tx } = useI18n();
  const m = useMessages(DEV_MESSAGES);
  const [key, setKey] = useState('');
  const filteredKey = key.trim();
  const readers = useMemo(() => new Set(registry.panelsReading(filteredKey)), [registry, filteredKey]);
  const writers = useMemo(() => new Set(registry.panelsWriting(filteredKey)), [registry, filteredKey]);
  const rows = useMemo(() => registry.menus.flatMap(menu => registry.panels(menu.id)).filter(panel => !filteredKey || readers.has(panel) || writers.has(panel)), [registry, filteredKey, readers, writers]);
  const columns: PlatformColumn<RegisteredPanel>[] = [
    { id: 'id', header: m('panelId'), cell: panelId },
    { id: 'title', header: m('panelTitle'), cell: panel => tx(panel.title) },
    { id: 'query', header: m('panelQuery'), cell: panel => inputNames(panel.queryInputs) },
    { id: 'display', header: m('panelDisplay'), cell: panel => inputNames(panel.displayInputs) },
    { id: 'outputs', header: m('panelOutputs'), cell: panel => panel.outputs.map(output => `${output.key} (${output.action})`).join(', ') },
    { id: 'grain', header: m('panelGrain'), cell: panel => panel.grain },
    { id: 'endpoints', header: m('panelEndpoints'), cell: panel => panel.endpoints.map(endpoint => endpoint.id).join(', ') },
    { id: 'permissions', header: m('panelPermissions'), cell: panel => panel.permissions.join(', ') },
    { id: 'writing', header: m('panelWriting'), cell: panel => writers.has(panel) ? panelId(panel) : '' },
    { id: 'reading', header: m('panelReading'), cell: panel => readers.has(panel) ? panelId(panel) : '' },
  ];
  return <Dialog>
    <DialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={m('panelCatalog')} title={m('panelCatalog')}><LayoutDashboard className="size-4" aria-hidden /></Button></DialogTrigger>
    <DialogContent className="max-w-7xl">
      <DialogHeader><DialogTitle>{m('panelCatalog')}</DialogTitle><DialogDescription>{m('panelCatalogDescription')}</DialogDescription></DialogHeader>
      <div className="flex min-w-0 flex-col gap-3">
        <Label>{m('panelKeyFilter')}<Input value={key} onChange={event => setKey(event.target.value)} /></Label>
        <PlatformDataTable title={m('panelCatalog')} ariaLabel={m('panelCatalog')} rows={rows} columns={columns} getRowId={panelId} preferenceKey="dev-panel-catalog" pageSize={50} />
      </div>
    </DialogContent>
  </Dialog>;
}
