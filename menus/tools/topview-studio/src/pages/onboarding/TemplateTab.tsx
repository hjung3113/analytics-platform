import { useMemo, useState } from 'react';
import { buildGenericLayout, instantiateLayout, proposeTemplates, type LayoutDocument } from '@eqv/core';
import { formatProposalEvidence } from '@eqv/editor';
import { useMenuAction, usePlatform } from '@ap/kernel';
import { Button, Callout, EmptyState, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@ap/ui';
import { LAYOUT_EDIT_PERMISSION, saveDraft, type LayoutJson } from '../../endpoints';
import { Canvas, PANEL } from '../../parts/Canvas';
import { Toolbar } from '../../parts/Toolbar';
import type { EquipmentData } from './useEquipment';

const ASIDE = 'm-0 min-h-0 flex-1 overflow-y-auto p-3';

/**
 * ③ EV Template proposals of the selected window (ONBOARDING §3): ranked, one primary action (rank 1). Any proposal or bundled EV
 * Template can be looked at on the drawing without touching the working Layout; starting creates the Layout draft only while there is none.
 */
export function TemplateTab({ data }: { data: EquipmentData }) {
  const { can, setPage, toast } = usePlatform();
  const canStart = can(LAYOUT_EDIT_PERMISSION) && data.draft === null;
  const { inventory, dictionaries, templates } = data;
  const proposals = useMemo(() => (inventory && inventory.aliases.length > 0 ? proposeTemplates({ inventory, dictionaries: [...dictionaries], templates: [...templates] }) : null), [inventory, dictionaries, templates]);
  const generic = useMemo(() => (inventory && inventory.aliases.length > 0 ? buildGenericLayout({ inventory, dictionaries: [...dictionaries] }).layout : null), [inventory, dictionaries]);
  const [viewed, setViewed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useMenuAction(saveDraft);
  const shownId = viewed ?? proposals?.[0]?.templateId ?? templates[0]?.id ?? null;
  const shown: LayoutDocument | null = shownId === 'generic' ? generic : templates.find((t) => t.id === shownId) ?? null;

  const start = async (source: 'generic' | string) => {
    const document = source === 'generic' ? generic : templates.find((t) => t.id === source);
    if (!document || create.pending) return;
    setError(null);
    try {
      const result = await create.run({ layoutId: data.layoutId, document: instantiateLayout(document, data.layoutId) as unknown as LayoutJson }, { expectedVersion: '0' });
      if (result.outcome === 'ok') { toast(`Layout 초안 ${data.layoutId}을(를) 만들었습니다`, 'info'); setPage({ step: 'mapping' }); }
      else setError(result.outcome === 'conflict' ? '이미 Layout 초안이 있습니다.' : result.outcome === 'forbidden' ? '권한이 없어 만들지 못했습니다.' : 'Layout 초안을 만들지 못했습니다.');
    } catch { setError('Layout 초안을 만들지 못했습니다.'); }
  };
  const view = (id: string) => <Button size="toolbar" variant="secondary" aria-pressed={shownId === id} onClick={() => setViewed(id)}>도면 열람</Button>;

  return <div className="flex min-h-0 flex-1 overflow-hidden">
    <aside aria-label="EV Template" className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-surface-card">
      <Tabs defaultValue="proposals" className="flex h-full min-h-0 min-w-0 flex-col">
        <TabsList aria-label="EV Template 보기" className="h-11 shrink-0"><TabsTrigger value="proposals">제안</TabsTrigger><TabsTrigger value="bundled">번들 EV Template</TabsTrigger></TabsList>
        <TabsContent value="proposals" className={ASIDE}>
          {data.draft && <p className="mb-3 text-xs text-text-secondary">Layout 초안 <code className="font-mono">{data.layoutId}</code>이 있습니다. 제안은 비교용입니다.</p>}
          {error && <Callout tone="red"><span role="alert">{error}</span></Callout>}
          {proposals === null ? <EmptyState size="sm" title="관측된 alias가 없어 EV Template을 제안할 수 없습니다" /> : <ol className="m-0 list-none space-y-3 p-0" aria-label="EV Template 제안">
            {proposals.map((proposal) => <li key={proposal.templateId} className="space-y-1 border-b border-border-subtle pb-3 text-xs">
              <p className="font-medium">{proposal.rank}. <span className="font-mono">{proposal.templateId}</span> · {proposal.fits ? '적합' : '검토 필요'}</p>
              <p className="text-text-secondary">{formatProposalEvidence(proposal)}</p>
              <p className="text-text-secondary">미설명 alias: {proposal.unexplainedAliases.length ? proposal.unexplainedAliases.join(', ') : '없음'}</p>
              <div className="flex flex-wrap gap-2 pt-1">{view(proposal.templateId)}
                {canStart && <Button size="toolbar" variant={proposal.rank === 1 ? 'primary' : 'secondary'} disabled={create.pending} onClick={() => void start(proposal.templateId)}>이 EV Template으로 시작</Button>}</div>
            </li>)}
            {generic && <li className="space-y-1 text-xs">
              <p className="font-medium">Generic Layout</p><p className="text-text-secondary">모든 형상과 배정은 assumed입니다.</p>
              <div className="flex flex-wrap gap-2 pt-1">{view('generic')}
                {canStart && <Button size="toolbar" variant="secondary" disabled={create.pending} onClick={() => void start('generic')}>Generic Layout으로 시작</Button>}</div>
            </li>}
          </ol>}
        </TabsContent>
        <TabsContent value="bundled" className={ASIDE}>
          {templates.length === 0 ? <EmptyState size="sm" title="번들 EV Template이 없습니다" /> : <ul className="m-0 list-none space-y-1 p-0" aria-label="번들 EV Template">
            {templates.map((t) => <li key={t.id} className={cn('rounded-md', shownId === t.id && 'bg-surface-row-selected')}>
              <Button size="toolbar" variant="navigation" className="h-auto w-full justify-start" aria-current={shownId === t.id ? 'true' : undefined} onClick={() => setViewed(t.id)}>
                <span className="flex min-w-0 flex-col items-start"><span className="truncate font-mono text-xs">{t.id}</span><span className="truncate text-xs text-text-secondary">{t.name}</span></span>
              </Button></li>)}
          </ul>}
        </TabsContent>
      </Tabs>
    </aside>
    <div className={cn(PANEL, 'flex-1')}>
      <Toolbar modeText={shownId === 'generic' ? 'Generic Layout · 열람' : shownId ? <>EV Template · <span className="font-mono">{shownId}</span> · 열람</> : 'EV Template'} tools={null} count={shown?.components.length ?? null} loading={false} />
      {shown ? <Canvas layout={shown} selectedId={null} onSelect={() => undefined} /> : <div className="p-4"><EmptyState title="열람할 EV Template이 없습니다" /></div>}
    </div>
  </div>;
}
