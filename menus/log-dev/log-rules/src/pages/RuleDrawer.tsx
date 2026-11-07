import { DetailDrawer, QueryView } from '@ap/components';
import { PlatformLink, useMenuQuery, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { ruleDetailEndpoint, ruleSetDetailEndpoint, type RuleDetail } from '../endpoints';
import { Original, Section, ScopeText, SupportBadge } from './presentation';
import { useRequirementKeys } from './useRequirementKeys';

function RequirementIds({ rule, modelId, softwareId }: { rule: RuleDetail; modelId: string | null; softwareId: string | null }) {
  const { linkTo } = usePlatform();
  const ids = [...new Set(rule.targets.flatMap(t => t.requirementIds))];
  const membership = useRequirementKeys(modelId, softwareId, ids.length > 0);
  return <Section title="요구사항 ID">{ids.length === 0 ? <p className="text-xs text-text-muted">Validator가 요구사항 ID를 주지 않았습니다.</p> : <>
    {ids.map(id => {
      const [module, event] = id.split('/');
      const known = membership.status === 'done' && membership.data !== null;
      return <div key={id} className="grid min-w-0 gap-1">{known && membership.data!.has(id) && modelId
        ? <PlatformLink className="text-xs text-accent-primary" href={linkTo('log-knowledge-spec', { params: { modelId }, page: { ...(softwareId ? { software: softwareId } : {}), module: module!, ...(event ? { event: `${module!.replace(/%/g, '%25').replace(/#/g, '%23')}/${event.replace(/%/g, '%25').replace(/#/g, '%23')}` } : {}) }, returnTo: true })}><span className="t-mono break-words">{id}</span><span> · 명세 보기</span></PlatformLink>
        : <><Original>{id}</Original>{known && <p className="text-xs text-text-warning-label">명세에 없는 요구사항 ID</p>}</>}</div>;
    })}
    {(membership.status !== 'done' || membership.data === null) && <p className="text-xs text-text-muted">{modelId ? '선택한 모델의 명세와 짝 여부를 아직 확인하지 못했습니다.' : '모델을 선택하면 명세 요구사항과 짝 여부를 확인합니다.'}</p>}
  </>}</Section>;
}
export function RuleDrawer({ ruleSetKey, ruleKey, modelId, softwareId, onClose, focusOnOpen }: { focusOnOpen: boolean; ruleSetKey: string; ruleKey: string; modelId: string | null; softwareId: string | null; onClose: () => void }) {
  const query = useMenuQuery(ruleDetailEndpoint, { ruleSetKey, ruleKey });
  if (query.response?.outcome === 'ok' && query.response.data === null) return <MissingDrawer title="규칙을 찾을 수 없습니다" body="현재 규칙 카탈로그에 없는 RuleSet 또는 Rule입니다." onClose={onClose} focusOnOpen={focusOnOpen} />;
  return <QueryView query={query}>{rule => rule && <DetailDrawer focusOnOpen={focusOnOpen} title={<span className="t-mono">{rule.ruleSetKey} / {rule.ruleKey}</span>} subtitle={`${rule.revision} · ${rule.title}`} onClose={onClose} tabs={[{ id: 'summary', label: '규칙 상세', content: <div className="grid min-w-0 gap-5 break-keep text-xs">
    <Section title="요약"><p>{rule.summary}</p><div><SupportBadge value={rule.support} /></div>{!rule.inCurrentRevision && <p className="text-text-muted">현재 Revision에는 없는 규칙입니다.</p>}</Section>
    <Section title="지원 범위"><ScopeText scope={rule.scope} /></Section>
    <Section title="대상 범위">{rule.targets.length === 0 ? <p>선언한 대상 범위가 없습니다.</p> : rule.targets.map(t => <div key={t.position} className="grid min-w-0 gap-1"><Original>{t.format}</Original><Original>{t.target}</Original></div>)}</Section>
    <RequirementIds rule={rule} modelId={modelId} softwareId={softwareId} />
    <Section title="Revision별 지원 변화">{rule.revisions.map(r => <div key={r.revision} className="flex flex-wrap items-center gap-2"><Original>{r.revision}</Original>{r.support ? <SupportBadge value={r.support} /> : <span>규칙 없음</span>}<span className="text-text-muted">{r.retired ? '퇴역' : r.isCurrent ? '현재' : '이전'}</span></div>)}</Section>
  </div> }]} />}</QueryView>;
}
export function RuleSetHistory({ ruleSetKey, onClose, onViewRules, focusOnOpen }: { ruleSetKey: string; onClose: () => void; onViewRules: () => void; focusOnOpen: boolean }) {
  const query = useMenuQuery(ruleSetDetailEndpoint, { ruleSetKey });
  return <QueryView query={query}>{data => data ? <DetailDrawer focusOnOpen={focusOnOpen} title={<><span className="t-mono">{ruleSetKey}</span> · RuleSet 이력</>} subtitle="Validator가 보고한 Revision 비교" onClose={onClose} tabs={[{ id: 'history', label: 'Revision 이력', content: <div className="grid min-w-0 gap-5 break-keep text-xs"><Button type="button" variant="secondary" size="toolbar" onClick={onViewRules}>이 RuleSet의 규칙 보기</Button>{data.revisions.map(r => <Section key={r.revision} title={`${r.revision} · ${r.retired ? '퇴역' : r.isCurrent ? '현재' : '이전'}`}>
    {!r.changes ? <p className="text-text-muted">비교할 이전 Revision이 없습니다.</p> : <>
      <Original>{r.previousRevision} → {r.revision}</Original>
      <Section title={`추가 ${r.changes.addedCount}개`}>{r.changes.added.map(id => <Original key={id}>{id}</Original>)}</Section>
      <Section title={`제거 ${r.changes.removedCount}개`}>{r.changes.removed.map(id => <Original key={id}>{id}</Original>)}</Section>
      <Section title={`지원 변경 ${r.changes.supportChangedCount}개`}>{r.changes.supportChanged.map(change => <div key={change.ruleKey} className="flex flex-wrap items-center gap-2"><Original>{change.ruleKey}</Original><SupportBadge value={change.from} /><span>→</span><SupportBadge value={change.to} /></div>)}</Section>
      {r.changes.truncated && <p>각 변경 목록은 최대 500개까지 표시합니다. 개수는 전체 변경 기준입니다.</p>}
    </>}
  </Section>)}</div> }]} /> : <MissingDrawer title="RuleSet을 찾을 수 없습니다" onClose={onClose} focusOnOpen={focusOnOpen} />}</QueryView>;
}

export function MissingDrawer({ title, body, onClose, focusOnOpen = false }: { title: string; body?: string; onClose: () => void; focusOnOpen?: boolean }) {
  return <DetailDrawer focusOnOpen={focusOnOpen} title={title} onClose={onClose} tabs={[{ id: 'missing', label: '상세', content: <p role="alert" className="break-keep text-sm">{title}{body ? `. ${body}` : ''}</p> }]} />;
}
