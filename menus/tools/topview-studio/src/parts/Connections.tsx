import { useId, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MATERIAL_KINDS, PHYSICAL_INTERFACE_KINDS, type Component, type LayoutDocument, type MaterialKind, type PhysicalInterfaceEdge } from '@eqv/core';
import { isPortFree, type AddPhysicalInterfaceSpec, type AddTransferCapabilitySpec } from '@eqv/editor';
import { Button, Checkbox, FieldLabel, Label, PanelSectionTitle, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@ap/ui';

const NEW_PORT = '__new__';

export interface ConnectionActions {
  addPhysicalInterface(spec: AddPhysicalInterfaceSpec): void;
  removePhysicalInterface(id: string): void;
  removePort(componentId: string, portId: string): void;
  addHoldingSite(componentId: string, kinds: MaterialKind[]): void;
  removeHoldingSite(componentId: string, siteId: string): void;
  addTransferCapability(spec: AddTransferCapabilitySpec): void;
  removeTransferCapability(id: string): void;
}

function Choice({ label, value, onChange, children }: { label: string; value: string; onChange(value: string): void; children: ReactNode }) {
  const id = useId();
  return <div className="space-y-1"><FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select value={value} onValueChange={onChange}><SelectTrigger id={id} density="compact"><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{children}</SelectContent></Select></div>;
}

function Row({ id, label, onDelete }: { id: string; label: string; onDelete?: () => void }) {
  return <li className="flex items-start justify-between gap-2 py-2 text-xs">
    <span className="min-w-0 space-y-1"><span className="block break-all font-mono">{id}</span><span className="block break-all text-text-muted">{label}</span></span>
    {onDelete && <Button size="icon-xs" variant="ghost" aria-label={`${id} 삭제`} onClick={onDelete}><Trash2 className="size-3.5" aria-hidden /></Button>}
  </li>;
}

function Section({ title, count, children, empty }: { title: string; count: number; children: ReactNode; empty?: ReactNode }) {
  return <section aria-label={title} className="space-y-2"><PanelSectionTitle>{title} · {count}</PanelSectionTitle>
    {count > 0 ? <ul className="divide-y divide-border-subtle">{children}</ul> : empty ?? <p className="text-xs text-text-muted">선언된 항목 없음</p>}</section>;
}

/**
 * The `연결` tab: every Physical Interface, Holding Site and Transfer Capability of the open document, and — for an editable draft with a
 * selected Component — removal buttons and add forms (ported from the dev tool's connection panel, single column for the narrow pane).
 */
export function Connections({ layout, selected, actions }: { layout: LayoutDocument; selected: Component | undefined; actions: ConnectionActions | null }) {
  return <div className="space-y-4">
    <Section title="Physical Interface" count={layout.physicalInterfaces.length}>
      {layout.physicalInterfaces.map(edge => <Row key={edge.id} id={edge.id} label={`${edge.a.componentId} ↔ ${edge.b.componentId} · ${edge.kind}`} onDelete={actions ? () => actions.removePhysicalInterface(edge.id) : undefined} />)}
    </Section>
    <Section title="Holding Site" count={layout.components.reduce((n, c) => n + c.holdingSites.length, 0)}>
      {layout.components.flatMap(c => c.holdingSites.map(site => <Row key={`${c.id}/${site.id}`} id={`${c.id}/${site.id}`} label={site.materialKinds.join(', ')} onDelete={actions ? () => actions.removeHoldingSite(c.id, site.id) : undefined} />))}
    </Section>
    <Section title="Transfer Capability" count={layout.transferCapabilities.length}>
      {layout.transferCapabilities.map(edge => <Row key={edge.id} id={edge.id} label={`${edge.a.componentId} ↔ ${edge.b.componentId} · ${edge.handlerComponentId}`} onDelete={actions ? () => actions.removeTransferCapability(edge.id) : undefined} />)}
    </Section>
    {actions && (selected
      ? <AddForms key={selected.id} layout={layout} component={selected} actions={actions} />
      : <p className="text-xs text-text-muted">연결을 추가하려면 Component를 선택하세요.</p>)}
  </div>;
}

function AddForms({ layout, component, actions }: { layout: LayoutDocument; component: Component; actions: ConnectionActions }) {
  const checkboxId = useId();
  const [partnerId, setPartnerId] = useState('');
  const [kind, setKind] = useState('');
  const [portId, setPortId] = useState(NEW_PORT);
  const [partnerPortId, setPartnerPortId] = useState(NEW_PORT);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>(['wafer']);
  const [siteId, setSiteId] = useState('');
  const [otherSite, setOtherSite] = useState('');
  const [handlerId, setHandlerId] = useState('');

  const partners = layout.components.filter(c => c.id !== component.id);
  const partner = partners.find(c => c.id === partnerId);
  const freePorts = (c: Component) => c.ports.filter(port => isPortFree(layout, c.id, port.id));
  const ownPorts = freePorts(component);
  const partnerPorts = partner ? freePorts(partner) : [];
  const canAddInterface = !!partner && PHYSICAL_INTERFACE_KINDS.some(k => k === kind)
    && (portId === NEW_PORT || ownPorts.some(p => p.id === portId)) && (partnerPortId === NEW_PORT || partnerPorts.some(p => p.id === partnerPortId));
  const robots = layout.components.filter(c => c.role === 'robot');
  const siteOptions = layout.components.map(c => ({ component: c, sites: c.holdingSites.filter(s => c.id !== component.id || s.id !== siteId) })).filter(g => g.sites.length > 0);
  const siteKey = (componentId: string, holdingSiteId: string) => `${componentId}/${holdingSiteId}`;
  const destination = siteOptions.flatMap(g => g.sites.map(s => ({ componentId: g.component.id, holdingSiteId: s.id }))).find(e => siteKey(e.componentId, e.holdingSiteId) === otherSite);
  const canAddCapability = component.holdingSites.some(s => s.id === siteId) && !!destination && robots.some(r => r.id === handlerId);

  return <div className="space-y-4 border-t border-border-subtle pt-3">
    <section aria-label="Physical Interface 추가" className="space-y-2">
      <PanelSectionTitle>Physical Interface 추가 · <span className="font-mono normal-case">{component.id}</span></PanelSectionTitle>
      <Choice label="상대 Component" value={partnerId} onChange={v => { setPartnerId(v); setPartnerPortId(NEW_PORT); }}>{partners.map(c => <SelectItem key={c.id} value={c.id}>{c.id}</SelectItem>)}</Choice>
      <Choice label="종류" value={kind} onChange={setKind}>{PHYSICAL_INTERFACE_KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</Choice>
      <Choice label="포트" value={portId} onChange={setPortId}><SelectItem value={NEW_PORT}>새 포트</SelectItem>{ownPorts.map(p => <SelectItem key={p.id} value={p.id}>{p.id}</SelectItem>)}</Choice>
      <Choice label="상대 포트" value={partnerPortId} onChange={setPartnerPortId}><SelectItem value={NEW_PORT}>새 포트</SelectItem>{partnerPorts.map(p => <SelectItem key={p.id} value={p.id}>{p.id}</SelectItem>)}</Choice>
      <Button size="toolbar" variant="secondary" disabled={!canAddInterface} onClick={() => {
        if (!canAddInterface) return;
        actions.addPhysicalInterface({ a: { componentId: component.id, portId: portId === NEW_PORT ? null : portId }, b: { componentId: partnerId, portId: partnerPortId === NEW_PORT ? null : partnerPortId }, kind: kind as PhysicalInterfaceEdge['kind'] });
        setPartnerId(''); setKind(''); setPortId(NEW_PORT); setPartnerPortId(NEW_PORT);
      }}><Plus className="size-3.5" aria-hidden />추가</Button>
    </section>
    <section aria-label="포트" className="space-y-2">
      <PanelSectionTitle>포트 · {component.ports.length}</PanelSectionTitle>
      {component.ports.length === 0 ? <p className="text-xs text-text-muted">포트가 없습니다.</p> : <ul className="divide-y divide-border-subtle">{component.ports.map(p => <Row key={p.id} id={p.id} label={component.id} onDelete={() => actions.removePort(component.id, p.id)} />)}</ul>}
    </section>
    <section aria-label="Holding Site 추가" className="space-y-2">
      <PanelSectionTitle>Holding Site 추가</PanelSectionTitle>
      <div className="flex flex-wrap items-center gap-3">{MATERIAL_KINDS.map(value => <span key={value} className="flex items-center gap-2">
        <Checkbox id={`${checkboxId}-${value}`} checked={materialKinds.includes(value)} onCheckedChange={checked => setMaterialKinds(prev => checked === true ? [...prev, value] : prev.filter(k => k !== value))} />
        <Label htmlFor={`${checkboxId}-${value}`}>{value}</Label></span>)}</div>
      <Button size="toolbar" variant="secondary" disabled={materialKinds.length === 0} onClick={() => actions.addHoldingSite(component.id, materialKinds)}><Plus className="size-3.5" aria-hidden />추가</Button>
    </section>
    <section aria-label="Transfer Capability 추가" className="space-y-2">
      <PanelSectionTitle>Transfer Capability 추가</PanelSectionTitle>
      <Choice label="Holding Site" value={siteId} onChange={setSiteId}>{component.holdingSites.map(s => <SelectItem key={s.id} value={s.id}>{s.id}</SelectItem>)}</Choice>
      <Choice label="상대 Holding Site" value={otherSite} onChange={setOtherSite}>{siteOptions.map(g => <SelectGroup key={g.component.id}><SelectLabel>{g.component.id}</SelectLabel>
        {g.sites.map(s => <SelectItem key={s.id} value={siteKey(g.component.id, s.id)}>{g.component.id}/{s.id}</SelectItem>)}</SelectGroup>)}</Choice>
      <Choice label="Handler" value={handlerId} onChange={setHandlerId}>{robots.map(r => <SelectItem key={r.id} value={r.id}>{r.id}</SelectItem>)}</Choice>
      {robots.length === 0 && <p className="text-xs text-text-muted">role이 robot인 Component가 없습니다.</p>}
      <Button size="toolbar" variant="secondary" disabled={!canAddCapability} onClick={() => {
        if (!canAddCapability || !destination) return;
        actions.addTransferCapability({ a: { componentId: component.id, holdingSiteId: siteId }, b: destination, handlerComponentId: handlerId });
        setSiteId(''); setOtherSite(''); setHandlerId('');
      }}><Plus className="size-3.5" aria-hidden />추가</Button>
    </section>
  </div>;
}
