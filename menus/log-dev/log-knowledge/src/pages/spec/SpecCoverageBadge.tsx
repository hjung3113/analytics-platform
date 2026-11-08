import { PlatformLink, useMenuQuery, usePlatform } from '@ap/kernel';
import { AlertTriangle } from 'lucide-react';
import { StatusBadge } from '@ap/ui';
import { specCoverageEndpoint, type SpecCoverageData } from '../../endpoints';
import { useSpecWords } from './SpecControls';

const REASON: Record<Extract<SpecCoverageData, { computable: false }>['reason'], [string, string]> = {
  no_catalog: ['검증 규칙 카탈로그를 아직 받지 못했습니다', 'The validation rule catalog has not been received yet'],
  no_spec: ['발행된 명세가 없습니다', 'No published specification'],
  ambiguous_key: ['명세 요구사항 키가 비어 있거나 구분자와 겹칩니다', 'A requirement key is empty or contains the separator'],
  no_requirement_ids: ['Validator가 요구사항 ID를 주지 않았습니다', 'The Validator declared no requirement ids'],
  unavailable: ['검증 규칙 연동이 켜져 있지 않습니다', 'Rule catalog link is not enabled'],
};

/**
 * 명세 커버리지 of this model (and SW version) beside the spec header (#1496 R-f): requirements without a rule, from the rule catalog. Configuration
 * information, never a pass/fail; when it cannot be computed the reason is said, never a zero. Links to the validation rules coverage tab.
 */
export function SpecCoverageBadge({ modelId, softwareId, enabled }: { modelId: string; softwareId: string | null; enabled: boolean }) {
  const w = useSpecWords(), { linkTo } = usePlatform();
  const query = useMenuQuery(specCoverageEndpoint, { modelId, ...(softwareId ? { softwareId } : {}) }, enabled);
  const response = query.response;
  if (!response || response.outcome !== 'ok' || !response.data) return null;
  const data = response.data;
  // A registry without the validation rules menu (it is a separate group) has no destination: the badge then shows without the link.
  let href: string | null = null;
  try { href = linkTo('log-rules', { page: { tab: 'coverage', modelId, ...(softwareId ? { softwareId } : {}) } }); } catch { href = null; }
  const reason = data.computable ? null : REASON[data.reason];
  return <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary" aria-label={w('명세 커버리지', 'Specification coverage')}>
    {data.computable
      ? <><StatusBadge tone={data.counts.no_rule > 0 ? 'warning' : 'neutral'}>{data.counts.no_rule > 0 && <AlertTriangle className="size-3" aria-hidden />}{w(`규칙 없음 ${data.counts.no_rule} · 요구사항 ${data.counts.total}`, `No rule ${data.counts.no_rule} · requirements ${data.counts.total}`)}</StatusBadge><span>{w('통과가 아니라 구성 정보입니다', 'Configuration information, not a pass result')}</span></>
      : <><StatusBadge tone="neutral">{w('명세 커버리지 계산 불가', 'Specification coverage unavailable')}</StatusBadge><span>{reason ? w(reason[0], reason[1]) : ''}</span></>}
    {href && <PlatformLink className="text-accent-primary hover:underline" href={href}>{w('검증 규칙에서 보기', 'View in validation rules')}</PlatformLink>}
  </p>;
}
