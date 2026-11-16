import { formatNumber } from '@ap/contracts';
import { AnalysisChart, QueryView, type HistogramSpec } from '@ap/components';
import { useI18n, useMenuQuery, useMessages } from '@ap/kernel';
import { HW_TIME_MODULE_TYPES, HW_TIME_UNIT, hwTimeOverview, type HtmStatus } from '../../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES, HW_TIME_STEPPED_MESSAGES as S } from '../../messages';
import type { HwTimeFilter } from '../../shared/useHwTimeFilter';
import { panelDeclarations, panelRunTarget, projectQueryInputs } from './panelDeclaration';

type RunInput = { drillModule?: string | null; drillMotion?: string | null; trend?: string | null; verdict?: HtmStatus | null; date?: string | null };
type Link = { verdict?: HtmStatus; date?: string };
export function DistributionPanel({ input, filter }: { input: RunInput; filter: Pick<HwTimeFilter, 'selectionFor'> }) {
  const projected = projectQueryInputs(panelDeclarations.distribution, input);
  const target = panelRunTarget('scatter', projected);
  const link: Link = { ...(projected.verdict ? { verdict: projected.verdict as HtmStatus } : {}), ...(projected.date ? { date: projected.date } : {}) };
  return target ? <DistributionQuery target={target} link={link} filter={filter} /> : null;
}

function DistributionQuery({ target, link, filter }: { target: string; link: Link; filter: Pick<HwTimeFilter, 'selectionFor'> }) {
  const [moduleId, motionId] = target.split('/');
  const type = HW_TIME_MODULE_TYPES.find(type => (type.modules as readonly string[]).includes(moduleId!))!;
  const query = useMenuQuery(hwTimeOverview.distribution, { moduleType: type.id, drillModule: moduleId!, drillMotion: motionId!, ...link });
  const m = useMessages(S);
  const overview = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { lang } = useI18n();
  const checks = filter.selectionFor(type.id);
  const hidden = !checks.modules.includes(moduleId!) || !checks.motions.includes(motionId!);
  return <div hidden={hidden} className={hidden ? 'hidden' : 'flex h-full min-h-0 flex-col'}>
    <QueryView fill query={query}>{data => {
      const { lower, upper } = data.bounds;
      const referenceLines: NonNullable<HistogramSpec['referenceLines']> = [];
      if (upper !== null) referenceLines.push({ id: 'htm-upper', value: upper, label: m('distributionUpper', { value: String(upper) }), tone: 'danger' });
      if (lower !== null) referenceLines.push({ id: 'htm-lower', value: lower, label: m('distributionLower', { value: String(lower) }), tone: 'warning' });
      const spec: HistogramSpec = {
        kind: 'histogram', bins: data.bins, xUnit: HW_TIME_UNIT[lang], xLabel: m('distributionX'), referenceLines,
        binStatus: bin => {
          if (bin.count <= 0) return undefined;
          if (upper !== null && bin.start >= upper) return { tone: 'danger', label: overview('verdictOver') };
          if (lower !== null && bin.end <= lower) return { tone: 'warning', label: overview('verdictUnder') };
          return undefined;
        },
      };
      return <AnalysisChart chartId="hw-overview-distribution" title={m('distribution')} description={overview('synthetic')}
        legendCaption={m('distributionCaption', { module: moduleId!, motion: motionId!, total: formatNumber(data.total, lang, { decimals: 0 }), equipment: formatNumber(data.equipment, lang, { decimals: 0 }) })}
        unit={m('distributionCount')} spec={spec} size="fill" legendPlacement="bottom" toolsReveal="always" />;
    }}</QueryView>
  </div>;
}
