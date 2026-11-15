import { useLifecycleNavigate } from './host';
import { usePageValue } from './usePageValue';
import { useRef, useState } from 'react';
import { Button, FieldList, FieldRow, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { STAGE_LABEL, type Params, type Page, type Project, type ProjectEvent, type Round, type ScreenProps } from './contracts';
import { GateBadge, Pager, ReadView, Section, StageBadge, StageStepper } from './presentation';
import { LifecycleForm } from './forms';
import { RoundFrame } from './RoundScreen';
import { RoundSummaryCell } from './RoundExecution';
import { pageCopy } from './messages';
import type { PageAction } from './contracts';

export function ProjectScreen(props: ScreenProps & { projectId: string; roundId?: string }) {
  const { api, ui, projectId, roundId, canProject, canRound } = props;
  const navigate = useLifecycleNavigate();
  const project = api.useRead<Project>('projectDetail', { projectId });
  const rounds = api.useRead<{ rows: Round[] }>('rounds', { projectId });
  const [tab, setTab] = usePageValue(props, 'tab', 'rounds');
  const [eventPage, setEventPage] = usePageValue(props, 'page', 0);
  const events = api.useRead<Page<ProjectEvent>>('projectEvents', { projectId, page: eventPage, pageSize: 25 }, tab === 'history' && !roundId);
  const [form, setForm] = useState<{ name: string; title: string; initial: Params; version?: string } | null>(null);
  const actionReturnFocusRef = useRef<HTMLElement>(null);
  if (roundId) return <RoundFrame key={roundId} {...props} roundId={roundId} projectId={projectId} projectQuery={project} />;
  const p = project.status === 'done' ? project.data : null;
  const secondaryActions: PageAction[] = [];
  let primaryAction: PageAction | undefined;
  if (p && !roundId) {
    const forward = p.nextStages.find(stage => stage !== 'cancelled');
    const stageAction = (stage: string): PageAction => ({ label: stage === 'cancelled' ? pageCopy.cancel : pageCopy.move(STAGE_LABEL[stage] ?? stage), allowed: canProject, reason: pageCopy.projectPermission, onSelect: () => setForm({ name: 'projectSetStage', title: stage === 'cancelled' ? pageCopy.cancel : pageCopy.move(STAGE_LABEL[stage] ?? stage), initial: { id: p.id, toStage: stage, reason: '' }, version: p.version }) });
    const active = !['completed', 'cancelled'].includes(p.stage);
    const openRound: PageAction = { label: pageCopy.roundOpen, allowed: canRound && p.openRound === null, reason: canRound ? pageCopy.openRound : pageCopy.roundPermission, onSelect: () => setForm({ name: 'roundOpen', title: pageCopy.roundOpen, initial: { projectId } }) };
    if (canProject && forward) primaryAction = stageAction(forward);
    else if (canRound && active && p.openRound === null) primaryAction = openRound;
    if (active && primaryAction !== openRound) secondaryActions.push(openRound);
    if (p.nextStages.length > 0) secondaryActions.push({ label: pageCopy.projectUpdate, allowed: canProject, reason: pageCopy.projectPermission, onSelect: () => setForm({ name: 'projectUpdate', title: pageCopy.projectUpdate, initial: { id: p.id, ownerActorId: p.owner.id, softwareId: p.softwareId ?? '', targetDate: p.targetDate ?? '' }, version: p.version }) });
    secondaryActions.push(...p.nextStages.filter(stage => !(canProject && stage === forward)).map(stageAction));
    if (p.reopenTo) secondaryActions.push({ label: pageCopy.reopen, allowed: canProject, reason: pageCopy.projectPermission, onSelect: () => setForm({ name: 'projectReopen', title: pageCopy.reopen, initial: { id: p.id, reason: '' }, version: p.version }) });
    secondaryActions.push({ label: pageCopy.profile, onSelect: () => navigate('model-profile', p.modelId, p.softwareId ?? undefined) });
  }
  return ui.page({ title: pageCopy.projectTitle(p?.model?.code ?? pageCopy.unknownModel), primaryAction, secondaryActions, actionReturnFocusRef, trust: { reasons: [], completedAt: project.completedAt }, children: <div className="grid min-w-0 gap-3 break-keep" data-testid="log-model-project"><ReadView query={project}>{p => <>
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"><FieldList layout="inline"><FieldRow label={pageCopy.software}>{p.softwareLabel ?? (p.softwareId ? pageCopy.unknownVersion : pageCopy.unassigned)}</FieldRow><FieldRow label={pageCopy.owner}>{p.owner.displayName || pageCopy.unknownName}</FieldRow><FieldRow label={pageCopy.target}>{p.targetDate ?? pageCopy.undecided}</FieldRow></FieldList><div className="min-w-0 flex-1"><StageStepper stage={p.stage} /></div>{p.stage === 'cancelled' ? <StageBadge stage={p.stage} /> : null}<GateBadge decision={p.gate.latest?.decision} /></div>
      <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="개발 건 상세"><TabsTrigger value="rounds">Round</TabsTrigger><TabsTrigger value="history">이력</TabsTrigger></TabsList><TabsContent value="rounds"><ReadView query={rounds}>{data => data.rows.length === 0 ? <p className="text-sm text-text-secondary">열린 Round가 없습니다. 샘플을 확정하고 Round를 열어 주세요.</p> : ui.table({ title: 'Round 목록', preferenceKey: 'log-lifecycle-rounds', rows: data.rows, columns: [
        { id: 'round', header: 'Round', sortable: false, cell: r => <Button variant="link" size="toolbar" onClick={() => navigate('round', projectId, r.id)}>Round {r.seq}</Button> },
        { id: 'execution', header: '최신 실행', sortable: false, cell: r => <RoundSummaryCell api={api} roundId={r.id} field="execution" /> },
        { id: 'verdict', header: '완료 시도 판정', sortable: false, cell: r => <RoundSummaryCell api={api} roundId={r.id} field="verdict" /> },
        { id: 'counts', header: '규칙 결과 · 검증 항목', sortable: false, cell: r => <RoundSummaryCell api={api} roundId={r.id} field="counts" /> },
        { id: 'gate', header: 'GATE', sortable: false, cell: r => <GateBadge decision={r.gateDecision} /> },
      ] })}</ReadView></TabsContent><TabsContent value="history"><Section title="개발 건 이력"><ReadView query={events}>{data => <>{ui.timeline(data.rows, projectId)}<Pager page={eventPage} total={data.total} onChange={setEventPage} /></>}</ReadView></Section></TabsContent></Tabs>
  </>}</ReadView>{form ? <LifecycleForm key={JSON.stringify([form.name, form.initial])} {...props} {...form} returnFocusRef={actionReturnFocusRef} onClose={() => setForm(null)} /> : null}</div> });
}
