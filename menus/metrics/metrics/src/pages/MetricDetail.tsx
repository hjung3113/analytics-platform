import { useEffect, useId, useRef, useState } from 'react';
import { type PageProps, PlatformLink, useI18n, useMenuQuery, usePlatform, usePlatformQuery } from '@ap/kernel';
import { AuditTimeline, Field, Panel, PlatformPage, QueryView, ReturnLink, StateMessage, useCopyLink } from '@ap/components';
import { Button, cn, StatusBadge } from '@ap/ui';
import { MetricPairBanner } from './MetricCatalog';
import {
  PERIOD_BASIS, definitionEndpoint, metricPairEndpoint, usageEndpoint, versionDiff,
  type MetricDef, type MetricVersion,
} from '../endpoints';
import { CONSUMER_LABEL, KIND_LABEL, STATUS_LABEL, STATUS_TONE } from './data';

const SECTIONS = [
  { id: 'definition', ko: '정의', en: 'Definition' },
  { id: 'version', ko: '버전', en: 'Version' },
  { id: 'ownership', ko: '소유', en: 'Ownership' },
  { id: 'coverage', ko: '커버리지', en: 'Coverage' },
  { id: 'usage', ko: '사용처', en: 'Usage' },
  { id: 'history', ko: '변경 이력', en: 'Change history' },
] as const;

function sectionId(id: string) { return `metric-section-${id}`; }

export default function MetricDetailPage({ params }: PageProps) {
  const metricId = params.metricId;
  const { adapter, pageParam, setPage, setGlobal, linkTo, resolveLink, global, url } = usePlatform();
  const { lang, tx } = useI18n();
  const copyVersionLink = useCopyLink(lang === 'ko' ? '이 버전의 링크를 복사했습니다.' : 'Copied the link to this version.');
  const versionParam = pageParam('version');
  const tab = pageParam('tab');
  const returnTo = pageParam('returnTo');
  const tabKnown = SECTIONS.some(s => s.id === tab);

  const pair = useMenuQuery(metricPairEndpoint, { viewedId: metricId, pageVersion: versionParam });
  const definition = useMenuQuery(definitionEndpoint, { metricId, version: versionParam });
  const usage = useMenuQuery(usageEndpoint, { metricId, version: versionParam ?? '' }, versionParam !== null);
  // ADR-0048: the shared audit store, same port read as the equipment Audit tab. A metric has no site, and the
  // record does not change with the global Context, so session identity: a period or scope change does not refetch.
  const history = usePlatformQuery(signal => adapter.entityAudit({ type: 'metric', id: metricId, scopeId: null }, signal), [metricId], true, 'session');

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
    && (tab !== 'history' || history.response !== null);

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
    primaryAction={selected && (selected.state === 'draft'
      // B-13: aria-disabled, not native disabled — the primary stays focusable and the reason is text,
      // not a tooltip (DESIGN Shared interaction: 실제 비활성과 이유를 opacity로 숨기지 않는다).
      ? <span className="flex items-center gap-2">
          <Button size="sm" aria-disabled className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:focus-visible:opacity-100"
            aria-describedby={draftNoteId}>
            {lang === 'ko' ? '이 버전을 분석 Context로 사용' : 'Use this version as analysis context'}
          </Button>
          <span id={draftNoteId} className="text-xs text-text-secondary">
            {lang === 'ko' ? '초안은 분석 Context로 쓰지 않습니다' : 'Drafts are not used as analysis context'}
          </span>
        </span>
      : <Button size="sm" data-testid="metric-apply-context" onClick={apply}
          title={global.metricId && global.metricId !== metricId
            ? (lang === 'ko' ? `다른 지표 ${global.metricId} 쌍 전체를 ${metricId} @ ${selected.version} 으로 바꿉니다.` : `Replaces the whole ${global.metricId} pair with ${metricId} @ ${selected.version}.`)
            : undefined}>
          {lang === 'ko' ? '이 버전을 분석 Context로 사용' : 'Use this version as analysis context'}
        </Button>)}
    secondaryActions={<>
      <Button variant="secondary" size="sm" onClick={() => copyVersionLink(url)}>
        {lang === 'ko' ? '버전 링크 복사' : 'Copy version link'}
      </Button>
      {returnTo !== null ? <ReturnLink /> : <Button asChild size="sm" variant="secondary">
        <PlatformLink href={linkTo('metric-catalog')}>
          {lang === 'ko' ? '카탈로그' : 'Catalog'}
        </PlatformLink>
      </Button>}
    </>}
    contextExtension={<nav aria-label={lang === 'ko' ? '카탈로그 영역' : 'Catalog sections'} className="flex flex-wrap gap-1">
      {SECTIONS.map(s => <button key={s.id} type="button" aria-current={tab === s.id ? 'true' : undefined}
        className={cn('h-8 rounded-sm border px-2.5 text-xs', tab === s.id ? 'border-accent-primary bg-accent-primary-soft font-semibold text-text-primary' : 'border-border-subtle bg-surface-card text-text-secondary hover:border-border-strong')}
        onClick={() => setPage({ tab: s.id })}>
        {lang === 'ko' ? s.ko : s.en}
      </button>)}
      {tab && !tabKnown && <span role="alert" className="self-center text-xs text-text-warning-label">{lang === 'ko' ? '등록되지 않은 탭입니다. 아래 섹션에서 다시 고르세요.' : 'This tab is not registered. Pick a section below.'}</span>}
    </nav>}
  >
    <div className="space-y-3">
      <MetricPairBanner query={pair} pageVersion={versionParam} />
      {global.selection !== null && <p className="text-xs text-text-secondary">
        {lang === 'ko' ? '설비 선택은 이 화면에서 참조만입니다.' : 'Equipment selection is reference only on this page.'}
      </p>}

      <QueryView widgetName={lang === 'ko' ? '지표 정의' : 'Metric definition'} query={definition} skeletonRows={6} skeletonHeight={220}>
        {data => <>
          {/* 06 §18: Data Trust states a displayed number's status. The definition shows no numbers and the envelope
              trust only describes the catalog mart read, so no trust is drawn here for any version state (user
              decision 2026-10-13, #299). */}
          {data.problem === 'unknown-metric' || !data.metric ? (
          <StateMessage tone="danger" icon={<span className="t-mono">!</span>} title={lang === 'ko' ? '지표를 찾을 수 없습니다' : 'Metric not found'}
            body={lang === 'ko' ? `${metricId} 는 카탈로그에 없습니다. 카탈로그로 돌아가 다시 고르세요.` : `${metricId} is not in the catalog. Go back to the catalog and pick another.`}
            action={<PlatformLink href={linkTo('metric-catalog')} className="text-xs font-medium text-accent-primary hover:underline">{lang === 'ko' ? '카탈로그로 돌아가기' : 'Back to the catalog'}</PlatformLink>} />
        ) : (
          <div className="space-y-3">
            {data.problem === 'version-not-member' && <StateMessage tone="danger" icon={<span className="t-mono">v{data.requestedVersion}</span>}
              title={lang === 'ko' ? '요청한 버전이 이 지표에 속하지 않습니다' : 'The requested version does not belong to this metric'}
              body={lang === 'ko' ? `${metricId} @ ${data.requestedVersion} 은 이 지표의 버전이 아닙니다. 아래에서 버전을 고르세요.` : `${metricId} @ ${data.requestedVersion} is not a version of this metric. Pick a version below.`} />}
            {data.problem === 'need-version' && <StateMessage icon={<span className="t-mono">v?</span>}
              title={lang === 'ko' ? '버전을 선택하세요' : 'Select a version'}
              body={data.metric.publishedPointer
                ? (lang === 'ko' ? `게시 포인터는 v${data.metric.publishedPointer} 입니다. 아래에서 버전을 고르세요.` : `The published pointer is v${data.metric.publishedPointer}. Pick a version below.`)
                : (lang === 'ko' ? '게시된 버전이 없습니다. 초안·폐기 버전을 직접 고르세요. 초안은 분석 기본값이 아닙니다.' : 'There is no published version. Choose a draft or deprecated version explicitly. Drafts are not analysis defaults.')} />}
            <div className="grid items-start gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="space-y-3">
                <VersionSection metric={data.metric} selected={data.version} onSelect={version => setPage({ version })} />
                <OwnershipSection metric={data.metric} />
              </div>
              <div className="space-y-3">
                {data.version ? <DefinitionSection metric={data.metric} version={data.version} previous={data.previous} /> : <Panel id={sectionId('definition')} title={lang === 'ko' ? '정의' : 'Definition'}><p className="text-xs text-text-secondary">{lang === 'ko' ? '버전을 고르기 전에는 정의를 보여 주지 않습니다.' : 'The definition stays hidden until a version is selected.'}</p></Panel>}
                {data.version && <CoverageSection version={data.version} ids={data.exampleEquipmentIds} rooms={data.exampleRooms} />}
              </div>
            </div>
          </div>
          )}
        </>}
      </QueryView>

      <Panel id={sectionId('usage')} title={lang === 'ko' ? '사용처 / 의존성' : 'Usage / dependency'}
        subtitle={versionParam
          ? (lang === 'ko' ? `${metricId} @ ${versionParam} 만 조회합니다. 확인 범위는 선언된 productivity-overview · cycle-time 입니다. 0건은 그 범위의 성공이며 전 플랫폼 미사용이 아닙니다.` : `Queries only ${metricId} @ ${versionParam}. The checked scope is the declared productivity-overview and cycle-time menus. Zero rows means that scope, not the whole platform.`)
          : (lang === 'ko' ? '버전을 고르면 그 쌍의 사용처만 조회합니다.' : 'Choose a version to query usage for that pair only.')}>
        {versionParam ? <QueryView widgetName={lang === 'ko' ? '사용처 / 의존성' : 'Usage / dependency'} hideWidgetName query={usage} compact skeletonRows={3}>
          {data => data.problem ? (
            <StateMessage tone="danger" icon={<span className="t-mono">!</span>} title={lang === 'ko' ? '이 버전의 사용처를 조회하지 않습니다' : 'Usage was not queried for this version'}
              body={lang === 'ko' ? '소속되지 않은 버전을 최신 게시 쌍으로 바꿔 사용처를 채우지 않습니다.' : 'A version that does not belong here is not rewritten to the latest published pair.'} />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="t-table-header text-left text-text-muted">
                <th className="py-1 pr-3 font-semibold">{lang === 'ko' ? '메뉴' : 'Menu'}</th>
                <th className="py-1 pr-3 font-semibold">{lang === 'ko' ? '위치' : 'Place'}</th>
                <th className="py-1 pr-3 text-right font-semibold">metricVersion</th>
                <th className="py-1 pr-3 font-semibold">{lang === 'ko' ? '근거' : 'Evidence'}</th>
                <th className="py-1 font-semibold">{lang === 'ko' ? '열기' : 'Open'}</th>
              </tr></thead>
              <tbody>{data.rows.map(row => <tr key={row.menuId} className="border-t border-border-subtle">
                <td className="py-2 pr-3">{tx(CONSUMER_LABEL[row.menuId])}<span className="mt-0.5 block t-mono text-text-muted">{row.menuId}</span></td>
                <td className="py-2 pr-3">{tx(row.place)}</td>
                <td className="py-2 pr-3 text-right tabular">v{row.version}</td>
                <td className="py-2 pr-3 text-xs text-text-secondary">{row.evidenceSource}<span className="mt-0.5 block text-text-muted">{lang === 'ko' ? '확인 시각 미확인' : 'Observed time not confirmed'}</span></td>
                <td className="py-2">{(() => {
                  const link = resolveLink(row.menuId, { global: { metricId, metricVersion: row.version } });
                  return link.allowed
                    ? <PlatformLink className="font-medium text-accent-primary hover:underline" href={link.href}>{lang === 'ko' ? '사용처 열기' : 'Open consumer'}</PlatformLink>
                    : <span className="text-xs text-text-muted">{lang === 'ko' ? '열 권한이 없습니다' : 'No access to open'}</span>;
                })()}</td>
              </tr>)}</tbody>
            </table>
          )}
        </QueryView> : null}
      </Panel>

      <Panel id={sectionId('history')} title={lang === 'ko' ? '변경 이력' : 'Change history'} subtitle={lang === 'ko' ? '정의의 등록·게시·폐기입니다. mart 계산 세대가 아닙니다.' : 'Registration, publication and deprecation of the definition. Not a mart generation.'}>
        <QueryView widgetName={lang === 'ko' ? '변경 이력' : 'Change history'} hideWidgetName query={history} compact skeletonRows={4}>
          {data => <AuditTimeline events={[...data.events]} />}
        </QueryView>
      </Panel>
      <p className="t-caption text-text-muted">
        {lang === 'ko'
          ? '섹션 이동은 앵커이며 정의·커버리지·사용처·변경 이력을 숨기지 않습니다. 예시 데이터입니다.'
          : 'Section navigation is an anchor; definition, coverage, usage and change history stay visible. Example data.'}
      </p>
    </div>
  </PlatformPage>;
}

function VersionSection({ metric, selected, onSelect }: { metric: MetricDef; selected: MetricVersion | null; onSelect: (version: string) => void }) {
  const { lang, tx } = useI18n();
  const previous = selected ? metric.versions[metric.versions.findIndex(v => v.version === selected.version) - 1] ?? null : null;
  const diff = selected ? versionDiff(selected, previous, lang) : [];
  return <Panel id={sectionId('version')} title={lang === 'ko' ? '버전' : 'Version'} subtitle={metric.publishedPointer ? (lang === 'ko' ? `게시 포인터 v${metric.publishedPointer}` : `Published pointer v${metric.publishedPointer}`) : (lang === 'ko' ? '게시 포인터 없음' : 'No published pointer')}>
    <ul className="space-y-1">
      {metric.versions.map(v => {
        const on = selected?.version === v.version;
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
      <p className="text-xs font-semibold text-text-primary">{previous ? (lang === 'ko' ? `v${selected.version} ↔ 이전 v${previous.version}` : `v${selected.version} ↔ previous v${previous.version}`) : (lang === 'ko' ? '이전 버전 없음' : 'No previous version')}</p>
      {previous && diff.length === 0 && <p className="mt-1 text-xs text-text-secondary">{lang === 'ko' ? '비교한 필드에 변경이 없습니다.' : 'No change in the compared fields.'}</p>}
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
  const { lang } = useI18n();
  return <Panel id={sectionId('ownership')} title={lang === 'ko' ? '소유' : 'Ownership'} subtitle={lang === 'ko' ? '정의 책임과 발행 권한은 별개입니다.' : 'Definition ownership and publish permission are separate.'}>
    <dl>
      <Field label={lang === 'ko' ? '정의 책임' : 'Owner'}>{lang === 'ko' ? metric.owner.ko : metric.owner.en}</Field>
      <Field label="ownerId" mono>{metric.ownerId}</Field>
      <Field label={lang === 'ko' ? '소유 조직' : 'Organization'} mono>{metric.organizationRef ?? (lang === 'ko' ? '미정' : 'Unset')}</Field>
    </dl>
  </Panel>;
}

function DefinitionSection({ metric, version, previous }: { metric: MetricDef; version: MetricVersion; previous: MetricVersion | null }) {
  const { lang, tx } = useI18n();
  const diff = versionDiff(version, previous, lang);
  return <Panel id={sectionId('definition')} title={lang === 'ko' ? '정의' : 'Definition'} subtitle={<span className="t-mono">{metric.metricId} @ {version.version}</span>}
    actions={<StatusBadge tone={STATUS_TONE[version.state]} dot>{tx(STATUS_LABEL[version.state])}</StatusBadge>}>
    <dl>
      <Field label={lang === 'ko' ? '유형' : 'Kind'}>{tx(KIND_LABEL[metric.kind])}</Field>
      <Field label={lang === 'ko' ? '수식 계약' : 'Formula contract'}>{tx(version.formula)}</Field>
      <Field label="grain">{tx(version.grain)}</Field>
      <Field label={lang === 'ko' ? '단위' : 'Unit'} mono>{version.unit}</Field>
      <Field label={lang === 'ko' ? '분자' : 'Numerator'} mono>{version.numerator ?? (lang === 'ko' ? '해당 없음' : 'Not applicable')}</Field>
      <Field label={lang === 'ko' ? '분모' : 'Denominator'} mono>{version.denominator ?? (lang === 'ko' ? '해당 없음' : 'Not applicable')}</Field>
      <Field label={lang === 'ko' ? '재집계' : 'Reaggregation'} mono>{version.reaggregationRule}</Field>
      <Field label="averageOfRatiosAllowed" mono>{String(version.averageOfRatiosAllowed)}</Field>
      <Field label="averageOfQuantilesAllowed" mono>{version.averageOfQuantilesAllowed === null ? '—' : String(version.averageOfQuantilesAllowed)}</Field>
      <Field label={lang === 'ko' ? '필터' : 'Filters'}>{version.filters.map(f => tx(f)).join(' · ') || '—'}</Field>
      <Field label={lang === 'ko' ? '기간 기준' : 'Time basis'}>{tx(PERIOD_BASIS)}</Field>
      <Field label="sourceContractRef" mono>{version.sourceContractRef}</Field>
    </dl>
    <p className="mt-3 text-xs text-text-muted">{previous ? (lang === 'ko' ? `이전 v${previous.version} 대비 변경 ${diff.length}개 필드는 왼쪽 버전 영역에 있습니다.` : `${diff.length} field(s) differ from previous v${previous.version}; see Version.`) : (lang === 'ko' ? '비교할 이전 버전이 없습니다.' : 'No previous version to diff.')}</p>
  </Panel>;
}

function CoverageSection({ version, ids, rooms }: { version: MetricVersion; ids: string[]; rooms: string[] }) {
  const { lang, tx } = useI18n();
  const c = version.coverage;
  return <Panel id={sectionId('coverage')} title={lang === 'ko' ? '커버리지 기준' : 'Coverage basis'} subtitle={lang === 'ko' ? '지표 정의에 적힌 기준입니다. 조회 결과에 보이는 커버리지 비율과는 다른 값입니다.' : 'The basis written in the metric definition. It is not the coverage rate shown with query results.'}>
    <dl>
      <Field label={lang === 'ko' ? '모집단' : 'Population'}>{tx(c.populationRef)}</Field>
      <Field label={lang === 'ko' ? '포함' : 'Included'}>{tx(c.includedBasis)}</Field>
      <Field label={lang === 'ko' ? '제외' : 'Excluded'}>{tx(c.excludedBasis)}</Field>
      <Field label={lang === 'ko' ? '분모 기준' : 'Denominator basis'}>{tx(c.denominatorBasis)}</Field>
      <Field label="sourceRef" mono>{c.sourceRef ?? (lang === 'ko' ? '미정' : 'Unset')}</Field>
    </dl>
    <p className="mt-3 text-xs font-semibold text-text-primary">{lang === 'ko' ? '실행 Coverage 값 없음' : 'No runtime coverage value'}</p>
    <p className="mt-1 text-xs text-text-secondary">
      {lang === 'ko'
        ? '아래 설비 ID는 정의의 모집단 규칙에 맞는 합성 예시입니다. 건수·비율로 읽지 않습니다. 설비 선택으로 좁히지 않습니다.'
        : 'The equipment IDs below are synthetic examples matching the definition’s population rule. Do not read them as a count or a rate. The equipment selection does not narrow them.'}
    </p>
    {ids.length === 0
      ? <p className="mt-2 text-xs text-text-secondary">{lang === 'ko' ? '예시 설비가 없습니다. 0%로 표시하지 않습니다.' : 'No example equipment. This is not shown as 0%.'}</p>
      : <ul className="mt-2 space-y-1">{ids.map(id => <li key={id} className="t-mono text-text-primary">{id}</li>)}</ul>}
    {rooms.length > 0 && <p className="mt-2 text-xs text-text-muted">room_name: <span className="t-mono">{rooms.join(', ')}</span></p>}
  </Panel>;
}
