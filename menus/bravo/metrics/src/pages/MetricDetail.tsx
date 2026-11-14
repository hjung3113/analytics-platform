import { useMessages } from '@ap/kernel';
import { METRICS_MESSAGES } from '../messages';
import { useEffect, useId, useRef, useState } from 'react';
import { type PageProps, PlatformLink, useEntityAudit, useI18n, useMenuQuery, usePlatform } from '@ap/kernel';
import { AuditTimeline, Panel, PlatformPage, QueryView, ReturnLink, StateMessage, useCopyLink } from '@ap/components';
import { Button, cn, FieldList, FieldRow, StatusBadge, Table, TableCaption, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@ap/ui';
import { MetricPairBanner } from './MetricCatalog';
import {
  PERIOD_BASIS, definitionEndpoint, metricPairEndpoint, usageEndpoint, versionDiff,
  type MetricDef, type MetricVersion,
} from '../endpoints';
import { CONSUMER_LABEL, KIND_LABEL, STATUS_LABEL, STATUS_TONE } from './data';

const SECTIONS = [
  { id: 'definition', ...METRICS_MESSAGES.metricDetailDefinition,  },
  { id: 'version', ...METRICS_MESSAGES.metricDetailVersion,  },
  { id: 'ownership', ...METRICS_MESSAGES.metricDetailOwnership,  },
  { id: 'coverage', ...METRICS_MESSAGES.metricDetailCoverage,  },
  { id: 'usage', ...METRICS_MESSAGES.metricDetailUsage,  },
  { id: 'history', ...METRICS_MESSAGES.metricDetailChangeHistory,  },
] as const;

const KEEP_PREVIOUS = { keepPrevious: true } as const;

function sectionId(id: string) { return `metric-section-${id}`; }

export default function MetricDetailPage({ params }: PageProps) {
  const m = useMessages(METRICS_MESSAGES);
  const metricId = params.metricId;
  const { pageParam, setPage, setGlobal, linkTo, resolveLink, global, url } = usePlatform();
  const { lang, tx } = useI18n();
  const copyVersionLink = useCopyLink(m('metricDetailCopiedTheLinkToThisVersion'));
  const versionParam = pageParam('version');
  const tab = pageParam('tab');
  const returnTo = pageParam('returnTo');
  const tabKnown = SECTIONS.some(s => s.id === tab);

  // keepPrevious ON (#1365, ADR-0114): the version buttons re-read the same metric, so the page keeps its frame and the old sections (refreshing) instead of three skeletons.
  // The old result is another version's definition: the version list marks the chosen version from the URL and the apply action waits (below).
  const pair = useMenuQuery(metricPairEndpoint, { viewedId: metricId, pageVersion: versionParam }, true, KEEP_PREVIOUS);
  const definition = useMenuQuery(definitionEndpoint, { metricId, version: versionParam }, true, KEEP_PREVIOUS);
  const usage = useMenuQuery(usageEndpoint, { metricId, version: versionParam ?? '' }, versionParam !== null, KEEP_PREVIOUS);
  // ADR-0048: the shared audit store, same port read as the equipment Audit tab. A metric has no site, and the
  // record does not change with the global Context, so session identity: a period or scope change does not refetch.
  const history = useEntityAudit({ type: 'metric', id: metricId, scopeId: null });

  // #325-2: the anchor scroll waits until every query rendering at or above the target has answered — any
  // outcome counts as landed (an error section holds its place too), and the pair banner sits above every
  // anchor. A target never waits for a query below it: usage gates only the usage·history targets, and only
  // when it is enabled (a page version is set). Scrolling while the sections above are skeletons lets their
  // late data push the arrived-at section out of the viewport. An arrival starts whenever `tab` changes to a
  // known value (chip click, Back/Forward through no tab or an unknown tab, known→known while queries load)
  // and scrolls exactly once when its gate opens; same-tab response changes (refetch, version/Context change
  // after the scroll) never scroll again. "The arrival I am waiting for" (state) stays separate from "the
  // arrival that already scrolled" (effect-owned ref) — no ref reads or writes during render, no timers.
  const upperReady = pair.response !== null && definition.response !== null;
  const usageReady = versionParam === null || usage.response !== null;
  const scrollGate = upperReady
    && ((tab !== 'usage' && tab !== 'history') || usageReady)
    && (tab !== 'history' || history.query.response !== null);

  const [arrival, setArrival] = useState<{ tab: string; token: number } | null>(null);
  const nextArrival = useRef(0); // effect-owned: tokens stay monotonic even when arrival resets through null
  const scrolledArrival = useRef<number | null>(null);

  useEffect(() => {
    if (!tab || !tabKnown) { setArrival(null); return; }
    nextArrival.current += 1;
    setArrival({ tab, token: nextArrival.current });
  }, [tab, tabKnown]);

  useEffect(() => {
    if (!arrival || arrival.tab !== tab) return; // an older arrival never scrolls for a newer tab
    if (scrolledArrival.current === arrival.token) return;
    if (!scrollGate) return;
    scrolledArrival.current = arrival.token;
    document.getElementById(sectionId(tab))?.scrollIntoView({ block: 'start' });
  }, [arrival, tab, scrollGate]);

  // While a kept result is shown (#1365) the usage rows and the pair verdict belong to the version they were loaded with, not to the URL's.
  const usageShown = usage.resultParams?.version ?? versionParam;
  const usageStale = usage.showingPrevious === true;
  const pairShown = pair.resultParams === undefined ? versionParam : pair.resultParams.pageVersion;

  const ready = definition.response?.outcome === 'ok' ? definition.response.data : null;
  const selected = ready?.version ?? null;
  const metric = ready?.metric ?? null;

  const draftNoteId = useId();

  const apply = () => {
    if (!selected) return;
    setGlobal({ metricId, metricVersion: selected.version });
  };

  return <PlatformPage
    title={metric ? tx(metric.name) : metricId}
    description={metric
      ? <span><span className="t-mono">{metric.metricId}</span> · {tx(metric.description)}</span>
      : <span className="t-mono">{metricId}</span>}
    // While the definition is refreshing, `selected` is still the previous version: offering it as the analysis Context would apply the wrong version.
    primaryAction={selected && definition.status !== 'refreshing' && (selected.state === 'draft'
      // B-13: aria-disabled, not native disabled — the primary stays focusable and the reason is text,
      // not a tooltip (DESIGN Shared interaction: 실제 비활성과 이유를 opacity로 숨기지 않는다).
      ? <span className="flex items-center gap-2">
          <Button size="sm" aria-disabled className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:focus-visible:opacity-100"
            aria-describedby={draftNoteId}>
            {m('metricDetailUseThisVersionAsAnalysisContext')}
          </Button>
          <span id={draftNoteId} className="text-xs text-text-secondary">
            {m('metricDetailDraftsAreNotUsedAsAnalysisContext')}
          </span>
        </span>
      : <Button size="sm" data-testid="metric-apply-context" onClick={apply}
          title={global.metricId && global.metricId !== metricId
            ? (m('metricDetailReplacesTheWholePairWith', { metricId: String(global.metricId), value2: String(metricId), version: String(selected.version) }))
            : undefined}>
          {m('metricDetailUseThisVersionAsAnalysisContext2')}
        </Button>)}
    secondaryActions={<>
      <Button variant="secondary" size="sm" onClick={() => copyVersionLink(url)}>
        {m('metricDetailCopyVersionLink')}
      </Button>
      {returnTo !== null ? <ReturnLink /> : <Button asChild size="sm" variant="secondary">
        <PlatformLink href={linkTo('metric-catalog')}>
          {m('metricDetailCatalog')}
        </PlatformLink>
      </Button>}
    </>}
    contextExtension={<nav aria-label={m('metricDetailCatalogSections')} className="flex flex-wrap gap-1">
      {SECTIONS.map(s => <button key={s.id} type="button" aria-current={tab === s.id ? 'true' : undefined}
        className={cn('h-8 rounded-sm border px-2.5 text-xs', tab === s.id ? 'border-accent-primary bg-accent-primary-soft font-semibold text-text-primary' : 'border-border-subtle bg-surface-card text-text-secondary hover:border-border-strong')}
        onClick={() => setPage({ tab: s.id })}>
        {s[lang]}
      </button>)}
      {tab && !tabKnown && <span role="alert" className="self-center text-xs text-text-warning-label">{m('metricDetailThisTabIsNotRegisteredPickA')}</span>}
    </nav>}
  >
    <div className="space-y-3">
      {/* While the definition below shows its own previous-selection notice for this transition, the pair verdict skips a second label; the queries resolve independently, so a pair that is still previous after the definition arrived labels itself (usage always keeps its own). */}
      <MetricPairBanner query={pair} pageVersion={pairShown} refreshNotice={definition.showingPrevious === true ? 'hidden' : 'visible'} />
      {global.selection !== null && <p className="text-xs text-text-secondary">
        {m('metricDetailEquipmentSelectionIsReferenceOnlyOnThis')}
      </p>}

      <QueryView widgetName={m('metricDetailMetricDefinition')} query={definition} skeletonRows={6} skeletonHeight={220}>
        {data => <>
          {/* 06 §18: Data Trust states a displayed number's status. The definition shows no numbers and the envelope
              trust only describes the catalog mart read, so no trust is drawn here for any version state (user
              decision 2026-10-13, #299). */}
          {data.problem === 'unknown-metric' || !data.metric ? (
          <StateMessage tone="danger" icon={<span className="t-mono">!</span>} title={m('metricDetailMetricNotFound')}
            body={m('metricDetailIsNotInTheCatalogGoBack', { metricId: String(metricId) })}
            action={<PlatformLink href={linkTo('metric-catalog')} className="text-xs font-medium text-accent-primary hover:underline">{m('metricDetailBackToTheCatalog')}</PlatformLink>} />
        ) : (
          <div className="space-y-3">
            {data.problem === 'version-not-member' && <StateMessage tone="danger" icon={<span className="t-mono">v{data.requestedVersion}</span>}
              title={m('metricDetailChooseAVersionOfThisMetric')}
              body={m('metricDetailCheckTheMetricVersionPickAVersion', { metricId: String(metricId), requestedVersion: String(data.requestedVersion) })} />}
            {data.problem === 'need-version' && <StateMessage icon={<span className="t-mono">v?</span>}
              title={m('metricDetailSelectAVersion')}
              body={data.metric.publishedPointer
                ? (m('metricDetailTheReleasedPointerIsVPickA', { publishedPointer: String(data.metric.publishedPointer) }))
                : (m('metricDetailNoReleasedVersionChooseADraftOr'))} />}
            <div className="grid items-start gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="space-y-3">
                <VersionSection metric={data.metric} selected={data.version} chosen={versionParam} onSelect={version => setPage({ version })} />
                <OwnershipSection metric={data.metric} />
              </div>
              <div className="space-y-3">
                {data.version ? <DefinitionSection metric={data.metric} version={data.version} previous={data.previous} /> : <Panel id={sectionId('definition')} title={m('metricDetailDefinition2')}><p className="text-xs text-text-secondary">{m('metricDetailTheDefinitionStaysHiddenUntilAVersion')}</p></Panel>}
                {data.version && <CoverageSection version={data.version} />}
              </div>
            </div>
          </div>
          )}
        </>}
      </QueryView>

      <Panel id={sectionId('usage')} title={m('metricDetailUsageDependency')}
        subtitle={versionParam
          ? usageStale
            ? (m('metricDetailUsageOfVLoadingVTheRows', { usageShown: String(usageShown), versionParam: String(versionParam), metricId: String(metricId) }))
            : (m('metricDetailQueriesOnlyCheckedScopeProductivityOverviewAnd', { metricId: String(metricId), versionParam: String(versionParam) }))
          : (m('metricDetailChooseAVersionToQueryUsageFor'))}>
        {versionParam ? <QueryView widgetName={m('metricDetailUsageDependency2')} hideWidgetName query={usage} compact skeletonRows={3}>
          {data => {
            if (data.problem) return (
            <StateMessage tone="danger" icon={<span className="t-mono">!</span>} title={m('metricDetailUsageLookupRequiresAValidVersion')}
              body={m('metricDetailAVersionThatDoesNotBelongHere')} />
            );
            return (
            <Table>
              <TableCaption srOnly>{tx(SECTIONS[4])}</TableCaption>
              <TableHeader><TableRow>
                <TableHead>{m('usageTableMenu')}</TableHead>
                <TableHead>{m('usageTablePlace')}</TableHead>
                <TableHead align="end">{m('usageTableVersion')}</TableHead>
                <TableHead>{m('usageTableEvidence')}</TableHead>
                <TableHead>{m('usageTableOpen')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>{data.rows.map(row => <TableRow key={row.menuId}>
                <TableCell>{tx(CONSUMER_LABEL[row.menuId])}<span className="mt-0.5 block t-mono text-text-muted">{row.menuId}</span></TableCell>
                <TableCell>{tx(row.place)}</TableCell>
                <TableCell align="end">v{row.version}</TableCell>
                <TableCell><div className="text-xs text-text-secondary">{row.evidenceSource}<span className="mt-0.5 block text-text-muted">{m('usageTableObservedUnknown')}</span></div></TableCell>
                <TableCell>{(() => {
                  const link = resolveLink(row.menuId, { global: { metricId, metricVersion: row.version } });
                  // Rows of the previous version stay readable, but opening them waits for the picked version (#1365).
                  if (usageStale) return <span className="text-xs text-text-muted">{m('usageTableLoading', { version: String(versionParam) })}</span>;
                  // A consumer menu this assembly does not register is not a permission matter: the row keeps its name and id as text, no link (06 §22).
                  if (link.kind === 'none') return null;
                  return link.allowed
                    ? <PlatformLink className="font-medium text-accent-primary hover:underline" href={link.href}>{m('usageTableOpenConsumer')}</PlatformLink>
                    : <span className="text-xs text-text-muted">{m('usageTableNoAccess')}</span>;
                })()}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
            );
          }}
        </QueryView> : null}
      </Panel>

      <Panel id={sectionId('history')} title={m('metricDetailChangeHistory2')} subtitle={m('metricDetailRegistrationReleaseAndDeprecationRecordsOfThe')}>
        <QueryView widgetName={m('metricDetailChangeHistory3')} hideWidgetName query={history.query} compact skeletonRows={4}>
          {() => <AuditTimeline {...history.timeline} />}
        </QueryView>
      </Panel>
      <p className="t-caption text-text-muted">
        {m('metricDetailSectionNavigationIsAnAnchorDefinitionCoverage')}
      </p>
    </div>
  </PlatformPage>;
}

function VersionSection({ metric, selected, chosen, onSelect }: { metric: MetricDef; selected: MetricVersion | null; /** The version in the URL: it leads the shown result while a kept previous result refreshes. */ chosen: string | null; onSelect: (version: string) => void }) {
  const m = useMessages(METRICS_MESSAGES);
  const { lang, tx } = useI18n();
  const previous = selected ? metric.versions[metric.versions.findIndex(v => v.version === selected.version) - 1] ?? null : null;
  const diff = selected ? versionDiff(selected, previous, lang) : [];
  return <Panel id={sectionId('version')} title={m('metricDetailVersion2')} subtitle={metric.publishedPointer ? (m('metricDetailReleasedPointerV', { publishedPointer: String(metric.publishedPointer) })) : (m('metricDetailNoReleasedPointer'))}>
    <ul className="space-y-1">
      {metric.versions.map(v => {
        const on = (chosen ?? selected?.version) === v.version;
        return <li key={v.version}>
          <button type="button" aria-pressed={on} onClick={() => onSelect(v.version)}
            className={cn('flex min-h-8 w-full items-center justify-between gap-2 rounded-sm border px-2 py-1 text-left text-xs', on ? 'border-accent-primary bg-accent-primary-soft' : 'border-border-subtle hover:border-border-strong')}>
            <span className="tabular font-semibold">v{v.version}</span>
            <StatusBadge tone={STATUS_TONE[v.state]}>{tx(STATUS_LABEL[v.state])}</StatusBadge>
          </button>
        </li>;
      })}
    </ul>
    {selected && <div className="mt-3 border-t border-border-subtle pt-2">
      <p className="text-xs font-semibold text-text-primary">{previous ? (m('metricDetailVPreviousV', { version: String(selected.version), value2: String(previous.version) })) : (m('metricDetailNoPreviousVersion'))}</p>
      {previous && diff.length === 0 && <p className="mt-1 text-xs text-text-secondary">{m('metricDetailNoChangeInTheComparedFields')}</p>}
      {diff.length > 0 && <dl className="mt-1 space-y-1 text-xs">
        {diff.map(row => <div key={row.field}>
          <dt className="t-mono text-text-muted">{row.field}</dt>
          <dd className="tabular"><span className="text-text-danger-label line-through decoration-1">{row.before}</span> → <span className="text-text-success-label">{row.after}</span></dd>
        </div>)}
      </dl>}
    </div>}
  </Panel>;
}

function OwnershipSection({ metric }: { metric: MetricDef }) {
  const m = useMessages(METRICS_MESSAGES);
  const { lang } = useI18n();
  return <Panel id={sectionId('ownership')} title={m('metricDetailOwnership2')} subtitle={m('metricDetailDefinitionOwnershipAndPublishPermissionAreSeparate')}>
    <FieldList>
      <FieldRow layout="detail" label={m('metricDetailOwner')}>{metric.owner[lang]}</FieldRow>
      <FieldRow layout="detail" label="ownerId" mono>{metric.ownerId}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailOrganization')} mono>{metric.organizationRef ?? (m('metricDetailUnset'))}</FieldRow>
    </FieldList>
  </Panel>;
}

function DefinitionSection({ metric, version, previous }: { metric: MetricDef; version: MetricVersion; previous: MetricVersion | null }) {
  const m = useMessages(METRICS_MESSAGES);
  const { lang, tx } = useI18n();
  const diff = versionDiff(version, previous, lang);
  return <Panel id={sectionId('definition')} title={m('metricDetailDefinition3')} subtitle={<span className="t-mono">{metric.metricId} @ {version.version}</span>}
    actions={<StatusBadge tone={STATUS_TONE[version.state]} dot>{tx(STATUS_LABEL[version.state])}</StatusBadge>}>
    <FieldList>
      <FieldRow layout="detail" label={m('metricDetailKind')}>{tx(KIND_LABEL[metric.kind])}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailFormulaContract')}>{tx(version.formula)}</FieldRow>
      <FieldRow layout="detail" label="grain">{tx(version.grain)}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailUnit')} mono>{version.unit}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailNumerator')} mono>{version.numerator ?? (m('metricDetailNotApplicable'))}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailDenominator')} mono>{version.denominator ?? (m('metricDetailNotApplicable2'))}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailReaggregation')} mono>{version.reaggregationRule}</FieldRow>
      <FieldRow layout="detail" label="averageOfRatiosAllowed" mono>{String(version.averageOfRatiosAllowed)}</FieldRow>
      <FieldRow layout="detail" label="averageOfQuantilesAllowed" mono>{version.averageOfQuantilesAllowed === null ? '—' : String(version.averageOfQuantilesAllowed)}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailFilters')}>{version.filters.map(f => tx(f)).join(' · ') || '—'}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailTimeBasis')}>{tx(PERIOD_BASIS)}</FieldRow>
      <FieldRow layout="detail" label="sourceContractRef" mono>{version.sourceContractRef}</FieldRow>
    </FieldList>
    <p className="mt-3 text-xs text-text-muted">{previous ? (m('metricDetailFieldSDifferFromPreviousVSee', { version: String(previous.version), length: String(diff.length) })) : (m('metricDetailNoPreviousVersionToDiff'))}</p>
  </Panel>;
}

function CoverageSection({ version }: { version: MetricVersion }) {
  const m = useMessages(METRICS_MESSAGES);
  const { tx } = useI18n();
  const c = version.coverage;
  return <Panel id={sectionId('coverage')} title={m('metricDetailCoverageBasis')} subtitle={m('metricDetailTheBasisWrittenInTheMetricDefinition')}>
    <FieldList>
      <FieldRow layout="detail" label={m('metricDetailPopulation')}>{tx(c.populationRef)}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailIncluded')}>{tx(c.includedBasis)}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailExcluded')}>{tx(c.excludedBasis)}</FieldRow>
      <FieldRow layout="detail" label={m('metricDetailDenominatorBasis')}>{tx(c.denominatorBasis)}</FieldRow>
      <FieldRow layout="detail" label="sourceRef" mono>{c.sourceRef ?? (m('metricDetailUnset2'))}</FieldRow>
    </FieldList>
    <p className="mt-3 text-xs font-semibold text-text-primary">{m('metricDetailNoRuntimeCoverageValue')}</p>
  </Panel>;
}
