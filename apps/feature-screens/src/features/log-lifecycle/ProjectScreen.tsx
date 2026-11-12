import { useLifecycleNavigate } from './host';
import { usePageValue } from './usePageValue';
import { useState } from 'react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { STAGE_LABEL, type Params, type Page, type Project, type ProjectEvent, type Round, type ScreenProps } from './contracts';
import { GateBadge, Pager, ReadView, Section, StageBadge, StageStepper } from './presentation';
import { LifecycleForm } from './forms';
import { RoundScreen } from './RoundScreen';
import { RoundSummaryCell } from './RoundExecution';

export function ProjectScreen(props: ScreenProps & { projectId: string; roundId?: string }) {
  const { api, ui, projectId, roundId, canProject, canRound } = props;
  const navigate = useLifecycleNavigate();
  const project = api.useRead<Project>('projectDetail', { projectId });
  const rounds = api.useRead<{ rows: Round[] }>('rounds', { projectId });
  const [tab, setTab] = usePageValue(props, 'tab', 'rounds');
  const [eventPage, setEventPage] = usePageValue(props, 'page', 0);
  const events = api.useRead<Page<ProjectEvent>>('projectEvents', { projectId, page: eventPage, pageSize: 25 }, tab === 'history' && !roundId);
  const [form, setForm] = useState<{ name: string; title: string; initial: Params; version?: string } | null>(null);
  return <div className="grid min-w-0 gap-5 break-keep" data-testid="log-model-project"><ReadView query={project}>{p => <>
    {!roundId ? <><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{p.model?.code ?? '모델 확인 불가'} · 개발 건{roundId ? ' · Round' : ''}</p><GateBadge decision={p.gate.latest?.decision} /></div>
    <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm"><div><dt className="text-xs text-text-muted">SW</dt><dd>{p.softwareLabel ?? (p.softwareId ? '버전 이름 확인 불가' : '미지정')}</dd></div><div><dt className="text-xs text-text-muted">담당</dt><dd>{p.owner.displayName || '이름 확인 불가'}</dd></div><div><dt className="text-xs text-text-muted">목표일</dt><dd>{p.targetDate ?? '미정'}</dd></div><div><dt className="text-xs text-text-muted">현재 단계</dt><dd><StageBadge stage={p.stage} /></dd></div></dl>
    <div><Button variant="link" size="toolbar" onClick={() => navigate('model-profile', p.modelId, p.softwareId ?? undefined)}>모델·SW 프로파일</Button></div>
    <StageStepper stage={p.stage} /></> : null}
    {roundId ? <RoundScreen key={roundId} {...props} roundId={roundId} project={p} /> : <>
      <div className="flex flex-wrap gap-2">{canRound && !['completed', 'cancelled'].includes(p.stage) ? <Button variant="secondary" size="toolbar" disabled={p.openRound !== null} onClick={() => setForm({ name: 'roundOpen', title: 'Round 열기', initial: { projectId } })}>Round 열기</Button> : null}
        {canProject && p.nextStages.length > 0 ? <Button variant="secondary" size="toolbar" onClick={() => setForm({ name: 'projectUpdate', title: '개발 건 수정', initial: { id: p.id, ownerActorId: p.owner.id, softwareId: p.softwareId ?? '', targetDate: p.targetDate ?? '' }, version: p.version })}>개발 건 수정</Button> : null}
        {canProject ? p.nextStages.map(stage => <Button key={stage} variant="secondary" size="toolbar" onClick={() => setForm({ name: 'projectSetStage', title: stage === 'cancelled' ? '개발 건 취소' : `${STAGE_LABEL[stage]}로 이동`, initial: { id: p.id, toStage: stage, reason: '' }, version: p.version })}>{stage === 'cancelled' ? '개발 건 취소' : `${STAGE_LABEL[stage]}로 이동`}</Button>) : null}
        {canProject && p.reopenTo ? <Button variant="secondary" size="toolbar" onClick={() => setForm({ name: 'projectReopen', title: '개발 건 재개', initial: { id: p.id, reason: '' }, version: p.version })}>개발 건 재개</Button> : null}
      </div>
      <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="개발 건 상세"><TabsTrigger value="rounds">Round</TabsTrigger><TabsTrigger value="history">이력</TabsTrigger></TabsList><TabsContent value="rounds"><ReadView query={rounds}>{data => data.rows.length === 0 ? <p className="text-sm text-text-secondary">열린 Round가 없습니다. 샘플을 확정하고 Round를 열어 주세요.</p> : ui.table({ title: 'Round 목록', preferenceKey: 'log-lifecycle-rounds', rows: data.rows, columns: [
        { id: 'round', header: 'Round', sortable: false, cell: r => <Button variant="link" size="toolbar" onClick={() => navigate('round', projectId, r.id)}>Round {r.seq}</Button> },
        { id: 'execution', header: '최신 실행', sortable: false, cell: r => <RoundSummaryCell api={api} roundId={r.id} field="execution" /> },
        { id: 'verdict', header: '완료 시도 판정', sortable: false, cell: r => <RoundSummaryCell api={api} roundId={r.id} field="verdict" /> },
        { id: 'counts', header: '규칙 결과 · 검증 항목', sortable: false, cell: r => <RoundSummaryCell api={api} roundId={r.id} field="counts" /> },
        { id: 'gate', header: 'GATE', sortable: false, cell: r => <GateBadge decision={r.gateDecision} /> },
      ] })}</ReadView></TabsContent><TabsContent value="history"><Section title="개발 건 이력"><ReadView query={events}>{data => <>{ui.timeline(data.rows, projectId)}<Pager page={eventPage} total={data.total} onChange={setEventPage} /></>}</ReadView></Section></TabsContent></Tabs>
    </>}
  </>}</ReadView>{form ? <LifecycleForm key={JSON.stringify([form.name, form.initial])} {...props} {...form} onClose={() => setForm(null)} /> : null}</div>;
}
