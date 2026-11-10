import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { latestBinding, layoutRevision } from '@eqv/core';
import { createBoardState, defaultEffectiveFrom, derivePublishPlan, dryRun, evaluateDrift, isBoardDirty, type BoardState, type DryRun, type SaveScope } from '@eqv/editor';
import { useI18n, useMenuQuery, usePlatform, useUnsavedGuard } from '@ap/kernel';
import { PlatformPage } from '@ap/components';
import { Button, Callout, EmptyState, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, TooltipProvider } from '@ap/ui';
import { EQV_ONBOARDING_MENU_ID, MAPPING_PUBLISH_PERMISSION, layoutRevisionsEndpoint, type FleetStatusCode } from '../../endpoints';
import { DEFAULT_STEP, FLEET_STATUS_LABEL, FLEET_STATUS_TONE, MARK_WORD, STEPS, isStep, publishBlockReason, stepMarks, windowHex, type StepKey } from '../../model/onboarding';
import { rowsOf } from '../../model/query';
import { useEquipment, type EquipmentData } from './useEquipment';
import { DataTab } from './DataTab';
import { InventoryTab } from './InventoryTab';
import { TemplateTab } from './TemplateTab';
import { MappingTab } from './MappingTab';
import { ValidateTab, PublishReview } from './ValidateTab';
import { DriftTab } from './DriftTab';

/** The dirty-guard line next to the shell's fixed consequence sentence (kernel §6.4). */
const GUARD_MESSAGE = '저장하지 않은 Mapping 변경이 있습니다.';

/** One equipment: crumbs and status in the header, the Sample Window selector, then one tab row of steps (advisor 3; ONBOARDING §1). */
export function EquipmentWorkspace({ equipmentId }: { equipmentId: string }) {
  const { pageParam, setPage, linkTo } = usePlatform();
  const { t } = useI18n();
  const rawStep = pageParam('step');
  const step: StepKey = rawStep !== null && isStep(rawStep) ? rawStep : DEFAULT_STEP;
  const windowKey = pageParam('window');
  const load = useEquipment(equipmentId, windowKey);
  const crumbs = [{ label: '설비 온보딩', href: linkTo(EQV_ONBOARDING_MENU_ID) }];
  const title = (status: FleetStatusCode | null) => <span className="flex min-w-0 items-center gap-2"><span className="truncate font-mono text-sm" title={equipmentId}>{equipmentId}</span>
    {status && <StatusBadge tone={FLEET_STATUS_TONE[status]}>{FLEET_STATUS_LABEL[status]}</StatusBadge>}</span>;
  if (load.kind !== 'ok') {
    return <PlatformPage crumbs={crumbs} title={title(null)}><div className="break-keep">
      {load.kind === 'loading' ? <p role="status" className="p-4 text-xs text-text-secondary">{t('loading')}</p>
        : load.kind === 'not-found' ? <EmptyState title="설비를 찾을 수 없습니다" action={<Button size="toolbar" variant="secondary" onClick={() => setPage({ equipment: null, step: null, window: null })}>Fleet으로 이동</Button>} />
          : load.kind === 'unknown-window' ? <EmptyState title="Sample Window를 찾을 수 없습니다" body="주소의 window가 이 설비의 Sample Window가 아닙니다." action={<Button size="toolbar" variant="secondary" onClick={() => setPage({ window: null })}>가장 늦은 window 열기</Button>} />
            : <Callout tone="red" title={load.message} action={<Button size="toolbar" variant="secondary" onClick={load.retry}>다시 시도</Button>}>{null}</Callout>}
    </div></PlatformPage>;
  }
  // Everything below belongs to one Sample Window: a window change (a guarded push) starts over.
  return <Loaded key={load.data.window?.hash ?? 'none'} data={load.data} step={step} crumbs={crumbs} title={title} />;
}

type Computed = { input: object; run: DryRun; revision: string } | { input: object; error: string };

function Loaded({ data, step, crumbs, title }: { data: EquipmentData; step: StepKey; crumbs: { label: string; href: string }[]; title(status: FleetStatusCode | null): ReactNode }) {
  const { setPage, can } = usePlatform();
  const canPublish = can(MAPPING_PUBLISH_PERMISSION);
  const { equipment, inventory, dictionaries, ruleFiles, templates, bindings, previous } = data;
  const layout = data.draft?.layout ?? null;

  // ---- Mapping Board state lives above the tabs; the address guard asks before any push leaves unsaved edits (kernel §6.4, ADR-0115) ----
  const boardInput = useMemo(() => (layout && inventory ? { equipment, inventory, dictionaries, layout, ruleFiles, templates } : null), [equipment, inventory, dictionaries, layout, ruleFiles, templates]);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [saveScope, setSaveScope] = useState<SaveScope>('model');
  if (board === null && boardInput !== null) setBoard(createBoardState({ equipment, ruleFiles }));
  const dirty = board !== null && isBoardDirty(board);
  useUnsavedGuard(dirty, { leaves: 'address', message: GUARD_MESSAGE, onDiscard: () => setBoard((b) => (b ? { ...b, present: b.baseline, past: [], future: [] } : b)) });

  // ---- D8 dry-run of the saved rules and the draft, in the browser; the server judges again on publish ----
  const runInput = useMemo(() => (layout && inventory ? { equipment, inventory, dictionaries, layout, ruleFiles } : null), [equipment, inventory, dictionaries, layout, ruleFiles]);
  const [computed, setComputed] = useState<Computed | null>(null);
  useEffect(() => {
    if (runInput === null) return undefined;
    let live = true;
    Promise.all([dryRun(runInput), layoutRevision(runInput.layout)]).then(
      ([run, revision]) => { if (live) setComputed({ input: runInput, run, revision }); },
      (error: unknown) => { if (live) setComputed({ input: runInput, error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { live = false; };
  }, [runInput]);
  const current = computed !== null && computed.input === runInput ? computed : null;
  const run = current && 'run' in current ? current : null;
  const [effectiveFrom, setEffectiveFrom] = useState(() => (inventory ? defaultEffectiveFrom(inventory, bindings) : ''));
  const plan = useMemo(() => (runInput && run ? derivePublishPlan({ ...runInput, bindings, previous, effectiveFrom }, { run: run.run, revision: run.revision }) : null), [runInput, run, bindings, previous, effectiveFrom]);
  const publishReason = layout === null ? 'Layout 초안이 없습니다. Template 탭에서 시작하세요.' : current && 'error' in current ? current.error : publishBlockReason({ dirty, plan });
  const [reviewing, setReviewing] = useState(false);
  const revisionsQ = useMenuQuery(layoutRevisionsEndpoint, { layoutId: data.layoutId }, canPublish && layout !== null);

  // ---- status and step marks ----
  const latest = bindings ? latestBinding(bindings.bindings) ?? null : null;
  const drift = latest === null || previous === null || inventory === null ? null : evaluateDrift({ baseline: data.baseline, layout: data.driftLayout, driftProblem: data.driftProblem }, inventory, previous);
  const status: FleetStatusCode = data.windows.length === 0 ? 'no-observations'
    : latest === null ? (Object.keys(ruleFiles).length > 0 ? 'draft' : 'unstarted')
      : drift === null || drift.unknown !== null ? 'drift-unknown' : drift.drifted ? 'drift' : 'published';
  const marks = stepMarks({
    windows: data.windows.filter((w) => w.state === 'active').length,
    aliases: inventory?.aliases.length ?? null,
    hasDraft: layout !== null,
    unmapped: run?.run.coverage ? run.run.coverage.unmapped.length : null,
    conflicts: run ? run.run.conflicts.length : null,
    upToDate: plan ? plan.problems.includes('이전 게시와 같습니다') : null,
    drift: latest === null ? 'unpublished' : drift === null || drift.unknown !== null ? 'unknown' : drift.drifted ? 'drifted' : 'none',
  });

  const selectable = data.windows.filter((w) => w.state !== 'retired');
  const go = (next: string) => setPage({ step: next === DEFAULT_STEP ? null : next });
  const actions = step === 'validate' && canPublish && <span className="flex items-center gap-2">
    {publishReason && <span id="publish-reason" className="text-xs text-text-muted">{publishReason}</span>}
    <Button size="toolbar" variant="primary" disabled={publishReason !== null} aria-describedby={publishReason ? 'publish-reason' : undefined} onClick={() => setReviewing(true)}>게시 검토</Button>
  </span>;

  return <TooltipProvider><PlatformPage layout="fill" bodyInset="none" crumbs={crumbs} title={title(status)} primaryAction={actions || undefined}>
    <div className="relative min-h-0 flex-1"><div className="absolute inset-0 flex min-h-0 flex-col break-keep">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-2 text-xs text-text-secondary">
        <span>{equipment.maker} / {equipment.model}</span>
        {selectable.length > 0 && <span className="flex items-center gap-2">
          <Label htmlFor="onboarding-window">Sample Window</Label>
          <Select value={data.window ? windowHex(data.window.hash) : ''} onValueChange={(hex) => setPage({ window: hex })}>
            <SelectTrigger id="onboarding-window" density="compact" className="w-80"><SelectValue placeholder="window를 고르세요" /></SelectTrigger>
            <SelectContent>{selectable.map((w) => <SelectItem key={w.hash} value={windowHex(w.hash)}>{w.from} – {w.to} · {w.dataGeneration}</SelectItem>)}</SelectContent>
          </Select>
        </span>}
        {data.window && <span>Inventory · Template 제안 · 검증 · Drift가 이 window에서 나옵니다.</span>}
      </div>
      <Tabs value={step} onValueChange={go} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label="온보딩 단계" className="ml-2 h-11 shrink-0">
          {STEPS.map(({ key, label }) => {
            const mark = marks[key];
            return <TabsTrigger key={key} value={key}><span className="flex items-center gap-1.5">
              {mark === 'done' && <CircleCheck className="size-3.5 text-text-success" aria-hidden />}
              {mark === 'attention' && <CircleAlert className="size-3.5 text-text-warning" aria-hidden />}
              {label}{mark && <span className="sr-only"> · {MARK_WORD[mark]}</span>}
            </span></TabsTrigger>;
          })}
        </TabsList>
        <TabsContent value="data" className="m-0 flex min-h-0 flex-1 flex-col"><DataTab data={data} /></TabsContent>
        <TabsContent value="inventory" className="m-0 flex min-h-0 flex-1 flex-col"><InventoryTab data={data} /></TabsContent>
        <TabsContent value="template" className="m-0 flex min-h-0 flex-1 flex-col"><TemplateTab data={data} /></TabsContent>
        <TabsContent value="mapping" className="m-0 flex min-h-0 flex-1 flex-col">
          {boardInput && board ? <MappingTab input={boardInput} board={board} setBoard={setBoard} saveScope={saveScope} setSaveScope={setSaveScope} data={data} />
            : <NoBoard hasInventory={inventory !== null} onTemplate={() => go('template')} />}
        </TabsContent>
        <TabsContent value="validate" className="m-0 flex min-h-0 flex-1 flex-col">
          {layout && inventory ? <ValidateTab data={data} layout={layout} run={run?.run ?? null} plan={plan} error={current && 'error' in current ? current.error : null} effectiveFrom={effectiveFrom} onEffectiveFrom={setEffectiveFrom} />
            : <NoBoard hasInventory={inventory !== null} onTemplate={() => go('template')} />}
        </TabsContent>
        <TabsContent value="drift" className="m-0 flex min-h-0 flex-1 flex-col"><DriftTab data={data} drift={drift} onMapping={() => go('mapping')} /></TabsContent>
      </Tabs>
    </div></div>
    {reviewing && plan && layout && inventory && <PublishReview data={data} layout={layout} plan={plan} effectiveFrom={effectiveFrom} revisions={rowsOf(revisionsQ)} onClose={() => setReviewing(false)} />}
  </PlatformPage></TooltipProvider>;
}

function NoBoard({ hasInventory, onTemplate }: { hasInventory: boolean; onTemplate(): void }) {
  return <div className="p-4"><EmptyState title={hasInventory ? 'Layout 초안이 없습니다' : '관측된 Sample Window가 없습니다'}
    body={hasInventory ? 'Template 탭에서 EV Template이나 Generic Layout으로 초안을 만드세요.' : 'Mapping과 검증은 Sample Window의 Inventory로 합니다.'}
    action={hasInventory ? <Button size="toolbar" variant="secondary" onClick={onTemplate}>Template 탭 열기</Button> : undefined} /></div>;
}
