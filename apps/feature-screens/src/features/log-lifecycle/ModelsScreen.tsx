import { useLifecycleNavigate } from './host';
import { usePageValue } from './usePageValue';
import { useState } from 'react';
import { Button, Input } from '@ap/ui';
import { STAGES, STAGE_LABEL, STATE_LABEL, type Model, type Page, type ScreenProps } from './contracts';
import { Choice, Disclosure, GateBadge, Pager, ReadView, StageBadge, StateBadge, time } from './presentation';
import { CatalogChoice } from './CatalogChoice';
import { LifecycleForm } from './forms';

export function ModelsScreen(props: ScreenProps) {
  const { api, ui, canProject, actorId } = props;
  const navigate = useLifecycleNavigate();
  const [q, setQ] = usePageValue(props, 'q', '');
  const [draft, setDraft] = useState({ applied: q, text: q });
  if (draft.applied !== q) setDraft({ applied: q, text: q });
  const [stage, setStage] = usePageValue(props, 'stage', 'all');
  const [validation, setValidation] = usePageValue(props, 'validation', 'all');
  const [vendorId, setVendorId] = usePageValue(props, 'vendorId', 'all');
  const [processId, setProcessId] = usePageValue(props, 'processId', 'all');
  const [active, setActive] = usePageValue(props, 'active', 'all');
  const [sort, setSort] = usePageValue(props, 'sort', 'code');
  const [page, setPage] = usePageValue(props, 'page', 0);
  const [creating, setCreating] = useState<Model | null>(null);
  const query = api.useRead<Page<Model>>('models', { includeClosedProjects: true, q: q || null, page, pageSize: 25, sorting: [{ id: sort, desc: sort === 'updatedAt' }], filters: [...(vendorId === 'all' ? [] : [{ id: 'vendorId', op: 'in', value: [vendorId] }]), ...(processId === 'all' ? [] : [{ id: 'processes', op: 'in', value: [processId] }]), ...(active === 'all' ? [] : [{ id: 'active', op: 'in', value: [active] }]), ...(stage === 'all' ? [] : [{ id: 'stage', op: stage === 'empty' ? 'isEmpty' : 'in', ...(stage === 'empty' ? {} : { value: [stage] }) }]), ...(validation === 'all' ? [] : [{ id: 'validation', op: 'in', value: [validation] }])] });
  return <div className="grid min-w-0 grid-cols-1 gap-4 break-keep" data-testid="log-models">
    <div className="flex min-w-0 flex-wrap items-end gap-3"><form className="min-w-0 max-w-sm flex-1" onSubmit={e => { e.preventDefault(); setQ(draft.text.trim()); }}><Input inputSize="toolbar" type="search" aria-label="모델 코드·이름 검색" placeholder="모델 코드·이름 검색" value={draft.text} onChange={e => setDraft({ applied: q, text: e.target.value })} /></form><Disclosure label="모델 필터·정렬">
      <Choice label="개발 단계" value={stage} onChange={setStage} options={[[ 'all', '전체 단계' ], ...STAGES.map(s => [s, STAGE_LABEL[s] ?? s] as const), ['cancelled', '취소'], ['empty', '개발 건 없음']]} /><Choice label="검증 상태" value={validation} onChange={setValidation} options={['all', 'fail', 'incomplete', 'claimed', 'queued', 'pass', 'none'].map(v => [v, STATE_LABEL[v] ?? '전체 상태'])} />
      <CatalogChoice api={api} name="vendors" label="설비사" value={vendorId} onChange={setVendorId} /><CatalogChoice api={api} name="processes" label="공정" value={processId} onChange={setProcessId} /><Choice label="활성" value={active} onChange={setActive} options={[[ 'all', '전체' ], ['true', '활성'], ['false', '비활성']]} /><Choice label="모델 정렬" value={sort} onChange={setSort} options={[[ 'code', '모델 코드순' ], ['vendorName', '설비사순'], ['stage', '개발 단계순'], ['updatedAt', '최근 갱신순']]} />
    </Disclosure></div>
    <ReadView query={query}>{data => data.rows.length === 0 ? <p role="status" className="text-sm text-text-secondary">{q || stage !== 'all' || validation !== 'all' || vendorId !== 'all' || processId !== 'all' || active !== 'all' ? '조건에 맞는 모델이 없습니다. 검색·필터를 변경해 주세요.' : '등록된 모델이 없습니다.'}</p> : ui.table({ title: '모델 목록', rows: data.rows, preferenceKey: 'log-lifecycle-models', summary: `${data.total}개 모델`, pagination: <Pager page={page} total={data.total} onChange={setPage} />, columns: [
      { id: 'model', size: 110, header: '모델', sortable: false, cell: m => <Button variant="link" size="toolbar" onClick={() => m.project ? navigate('project', m.project.projectId) : navigate('model-profile', m.id)}>{m.code}</Button> },
      { id: 'vendorName', size: 130, header: '제조사/설비사', sortable: false, cell: m => m.vendorName },
      { id: 'processes', size: 110, header: '공정', sortable: false, cell: m => m.processes.map(p => p.name).join(' · ') || '미분류' },
      { id: 'stage', size: 110, header: '개발 단계', sortable: false, cell: m => m.project ? <StageBadge stage={m.project.stage} /> : <span className="text-xs text-text-muted">개발 건 없음</span> },
      { id: 'validation', size: 110, header: '검증 상태', sortable: false, cell: m => <StateBadge value={m.validation} /> },
      { id: 'gate', size: 90, header: 'Gate', sortable: false, cell: m => <GateBadge decision={m.gateDecision} /> },
      { id: 'pending', size: 80, header: '대기 요청', sortable: false, cell: m => m.pendingRequests },
      { id: 'updatedAt', size: 130, header: '갱신 (KST)', sortable: false, cell: m => time(m.updatedAt) },
    ], rowAction: m => (!m.project || ['completed', 'cancelled'].includes(m.project.stage)) && canProject && m.active !== false ? <Button variant="secondary" size="toolbar" onClick={() => setCreating(m)}>개발 건 만들기</Button> : null })}</ReadView>
    {creating ? <LifecycleForm key={creating.id} {...props} name="projectCreate" title="개발 건 만들기" model={creating} initial={{ modelId: creating.id, kind: creating.project ? 'redevelopment' : 'new', ownerActorId: actorId }} onClose={() => setCreating(null)} onSuccess={r => { if (typeof r.data?.projectId === 'string') navigate('project', r.data.projectId); }} /> : null}
  </div>;
}
