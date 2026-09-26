import { useEffect } from 'react';
import { type PageProps, PlatformLink, useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { serve } from '../../mock/server';
import { AuditTimeline, DataTrustIndicator, Field, Panel, PlatformPage, QueryView, StateMessage } from '@ap/components';
import { Button, cn, StatusBadge } from '@ap/ui';
import { MetricPairBanner } from './MetricCatalog';
import {
  CONSUMER_LABEL, KIND_LABEL, PERIOD_BASIS, STATUS_LABEL, STATUS_TONE,
  buildDefinition, buildHistory, buildUsage, versionDiff,
  type MetricDef, type MetricVersion,
} from './data';

const SECTIONS = [
  { id: 'definition', ko: '정의', en: 'Definition' },
  { id: 'version', ko: '버전', en: 'Version' },
  { id: 'ownership', ko: '소유', en: 'Ownership' },
  { id: 'coverage', ko: '커버리지', en: 'Coverage' },
  { id: 'usage', ko: '사용처', en: 'Usage' },
  { id: 'history', ko: '이력', en: 'History' },
] as const;

function sectionId(id: string) { return `metric-section-${id}`; }

export default function MetricDetailPage({ params }: PageProps) {
  const metricId = params.metricId;
  const { pageParam, setPage, setGlobal, linkTo, global, url, toast } = usePlatform();
  const { lang, tx } = useI18n();
  const versionParam = pageParam('version');
  const tab = pageParam('tab');
  const tabKnown = SECTIONS.some(s => s.id === tab);

  const definition = usePlatformQuery(signal => serve({
    global, signal, requiresScope: false, mergeTimeDomain: false, latency: 280, kinds: ['processing_delay'],
    metricVersion: versionParam ?? undefined,
    compute: ({ equipment }) => buildDefinition(metricId, versionParam, equipment),
    isEmpty: () => false,
  }), [metricId, versionParam]);

  const usage = usePlatformQuery(signal => serve({
    global, signal, requiresScope: false, mergeTimeDomain: false, latency: 320, kinds: ['processing_delay'],
    metricVersion: versionParam ?? undefined,
    compute: () => buildUsage(metricId, versionParam),
    isEmpty: data => data.problem === null && data.rows.length === 0,
  }), [metricId, versionParam], versionParam !== null);

  const history = usePlatformQuery(signal => serve({
    global, signal, requiresScope: false, mergeTimeDomain: false, latency: 240, kinds: ['processing_delay'],
    compute: () => buildHistory(metricId, lang),
    isEmpty: () => false,
  }), [metricId, lang]);

  useEffect(() => {
    if (!tab || !tabKnown) return;
    document.getElementById(sectionId(tab))?.scrollIntoView({ block: 'start' });
  }, [tab, tabKnown]);

  const ready = definition.response?.outcome === 'ok' ? definition.response.data : null;
  const selected = ready?.version ?? null;
  const metric = ready?.metric ?? null;

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
      ? <Button size="sm" className="h-8 rounded-sm" disabled>{lang === 'ko' ? '초안은 분석 Context로 쓰지 않습니다' : 'Drafts are not used as analysis context'}</Button>
      : <Button size="sm" className="h-8 rounded-sm" data-testid="metric-apply-context" onClick={apply}
          title={global.metricId && global.metricId !== metricId
            ? (lang === 'ko' ? `다른 지표 ${global.metricId} 쌍 전체를 ${metricId} @ ${selected.version} 으로 바꿉니다.` : `Replaces the whole ${global.metricId} pair with ${metricId} @ ${selected.version}.`)
            : undefined}>
          {lang === 'ko' ? '이 버전을 분석 Context로 사용' : 'Use this version as analysis context'}
        </Button>)}
    secondaryActions={<>
      <Button variant="secondary" size="sm" className="h-8 rounded-sm" onClick={() => { void navigator.clipboard?.writeText(window.location.origin + url); toast(lang === 'ko' ? '이 버전의 링크를 복사했습니다.' : 'Copied the link to this version.'); }}>
        {lang === 'ko' ? '버전 링크 복사' : 'Copy version link'}
      </Button>
      <PlatformLink href={linkTo('metric-catalog')} className="inline-flex h-8 items-center rounded-sm border border-border-subtle bg-surface-raised px-3 text-[12px] font-medium hover:bg-surface-card">
        {lang === 'ko' ? '카탈로그' : 'Catalog'}
      </PlatformLink>
    </>}
    contextExtension={<nav aria-label={lang === 'ko' ? '카탈로그 영역' : 'Catalog sections'} className="flex flex-wrap gap-1">
      {SECTIONS.map(s => <button key={s.id} type="button" aria-current={tab === s.id ? 'true' : undefined}
        className={cn('h-8 rounded-sm border px-2.5 text-[12px]', tab === s.id ? 'border-accent-primary bg-accent-primary-soft font-semibold text-text-primary' : 'border-border-subtle bg-surface-card text-text-secondary hover:border-border-strong')}
        onClick={() => setPage({ tab: s.id })}>
        {lang === 'ko' ? s.ko : s.en}
      </button>)}
      {tab && !tabKnown && <span role="alert" className="self-center text-[12px] text-text-warning">{lang === 'ko' ? `등록되지 않은 tab=${tab}. 섹션을 숨기거나 다른 탭으로 바꾸지 않습니다.` : `Unregistered tab=${tab}. Sections stay visible and the value is not rewritten.`}</span>}
    </nav>}
  >
    <div className="space-y-3">
      <MetricPairBanner viewedId={metricId} pageVersion={versionParam} />
      {global.selection !== null && <p className="text-[12px] text-text-secondary">
        {lang === 'ko' ? '설비 선택은 참조만이며 정의·커버리지 예시를 Selection으로 좁히지 않습니다.' : 'Equipment selection is reference only and does not narrow the definition or coverage examples.'}
      </p>}

      <QueryView query={definition} skeletonRows={6} skeletonHeight={220}>
        {(data, response) => <>
          <div className="mb-2 flex justify-end"><DataTrustIndicator trust={response.trust} assessments={response.assessments} /></div>
          {data.problem === 'unknown-metric' || !data.metric ? (
          <StateMessage tone="danger" icon={<span className="t-mono">!</span>} title={lang === 'ko' ? '지표를 찾을 수 없습니다' : 'Metric not found'}
            body={lang === 'ko' ? `${metricId} 는 카탈로그에 없습니다. 다른 지표로 대체하지 않습니다.` : `${metricId} is not in the catalog. No other metric is substituted.`}
            action={<PlatformLink href={linkTo('metric-catalog')} className="text-[12px] font-medium text-accent-primary hover:underline">{lang === 'ko' ? '카탈로그로 돌아가기' : 'Back to the catalog'}</PlatformLink>} />
        ) : (
          <div className="space-y-3">
            {data.problem === 'version-not-member' && <StateMessage tone="danger" icon={<span className="t-mono">v{data.requestedVersion}</span>}
              title={lang === 'ko' ? '요청한 버전이 이 지표에 속하지 않습니다' : 'The requested version does not belong to this metric'}
              body={lang === 'ko' ? `${metricId} @ ${data.requestedVersion} 은 없습니다. 게시 포인터나 최신 버전으로 바꾸지 않습니다. 아래 버전을 명시적으로 고르세요.` : `${metricId} @ ${data.requestedVersion} does not exist. It is not replaced with the pointer or the latest version. Pick a version explicitly below.`} />}
            {data.problem === 'need-version' && <StateMessage icon={<span className="t-mono">v?</span>}
              title={lang === 'ko' ? '버전을 선택하세요' : 'Select a version'}
              body={data.metric.publishedPointer
                ? (lang === 'ko' ? `게시 포인터는 v${data.metric.publishedPointer} 입니다. 자동으로 페이지 버전이나 전역 쌍에 기록하지 않습니다.` : `The published pointer is v${data.metric.publishedPointer}. It is not written into the page version or the global pair automatically.`)
                : (lang === 'ko' ? '게시된 버전이 없습니다. 초안·폐기 버전을 직접 고르세요. 초안은 분석 기본값이 아닙니다.' : 'There is no published version. Choose a draft or deprecated version explicitly. Drafts are not analysis defaults.')} />}
            <div className="grid items-start gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="space-y-3">
                <VersionSection metric={data.metric} selected={data.version} onSelect={version => setPage({ version })} />
                <OwnershipSection metric={data.metric} />
              </div>
              <div className="space-y-3">
                {data.version ? <DefinitionSection metric={data.metric} version={data.version} previous={data.previous} /> : <Panel title={lang === 'ko' ? '정의' : 'Definition'}><p id={sectionId('definition')} className="scroll-mt-24 text-[12px] text-text-secondary">{lang === 'ko' ? '버전을 고르기 전에는 정의를 보여 주지 않습니다.' : 'The definition stays hidden until a version is selected.'}</p></Panel>}
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
        {versionParam ? <QueryView query={usage} compact skeletonRows={3}>
          {data => data.problem ? (
            <StateMessage tone="danger" icon={<span className="t-mono">!</span>} title={lang === 'ko' ? '이 버전의 사용처를 조회하지 않습니다' : 'Usage was not queried for this version'}
              body={lang === 'ko' ? '소속되지 않은 버전을 최신 게시 쌍으로 바꿔 사용처를 채우지 않습니다.' : 'A version that does not belong here is not rewritten to the latest published pair.'} />
          ) : (
            <table className="w-full text-[13px]">
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
                <td className="py-2 pr-3 text-[12px] text-text-secondary">{row.evidenceSource}<span className="mt-0.5 block text-text-muted">{lang === 'ko' ? '확인 시각 미확인' : 'Observed time unknown'}</span></td>
                <td className="py-2"><PlatformLink className="font-medium text-accent-primary hover:underline" href={linkTo(row.menuId, { global: { metricId, metricVersion: row.version } })}>{lang === 'ko' ? '사용처 열기' : 'Open consumer'}</PlatformLink></td>
              </tr>)}</tbody>
            </table>
          )}
        </QueryView> : null}
      </Panel>

      <Panel id={sectionId('history')} title={lang === 'ko' ? '이력' : 'History'} subtitle={lang === 'ko' ? '정의의 등록·게시·폐기입니다. mart 계산 세대가 아닙니다.' : 'Registration, publication and deprecation of the definition. Not a mart generation.'}>
        <QueryView query={history} compact skeletonRows={4}>
          {data => data.problem ? <StateMessage tone="danger" icon={<span className="t-mono">!</span>} title={lang === 'ko' ? '이력을 조회할 지표가 없습니다' : 'No metric to load history for'} body={metricId} /> : <AuditTimeline events={data.events} />}
        </QueryView>
      </Panel>
      <p className="t-caption text-text-muted">
        {lang === 'ko'
          ? 'Candidate: 섹션 키 tab은 앵커입니다. 정의·커버리지·사용처·이력을 숨기지 않습니다. 정의 등록·발행 워크플로는 Open이라 구현하지 않았습니다. 예시 데이터입니다.'
          : 'Candidate: the tab key is an anchor. Definition, coverage, usage and history stay visible. Registration and publish workflow is Open and not implemented. Synthetic data.'}
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
            className={cn('flex min-h-8 w-full items-center justify-between gap-2 rounded-sm border px-2 py-1 text-left text-[12px]', on ? 'border-accent-primary bg-accent-primary-soft' : 'border-border-subtle hover:border-border-strong')}>
            <span className="tabular font-semibold">v{v.version}</span>
            <StatusBadge tone={STATUS_TONE[v.state]}>{tx(STATUS_LABEL[v.state])}</StatusBadge>
          </button>
        </li>;
      })}
    </ul>
    {selected && <div className="mt-3 border-t border-border-subtle pt-2">
      <p className="text-[12px] font-semibold text-text-primary">{previous ? (lang === 'ko' ? `v${selected.version} ↔ 이전 v${previous.version}` : `v${selected.version} ↔ previous v${previous.version}`) : (lang === 'ko' ? '이전 버전 없음' : 'No previous version')}</p>
      {previous && diff.length === 0 && <p className="mt-1 text-[12px] text-text-secondary">{lang === 'ko' ? '비교한 필드에 변경이 없습니다.' : 'No change in the compared fields.'}</p>}
      {diff.length > 0 && <dl className="mt-1 space-y-1 text-[12px]">
        {diff.map(row => <div key={row.field}>
          <dt className="t-mono text-text-muted">{row.field}</dt>
          <dd className="tabular"><span className="text-text-danger line-through decoration-1">{row.before}</span> → <span className="text-text-success">{row.after}</span></dd>
        </div>)}
      </dl>}
    </div>}
  </Panel>;
}

function OwnershipSection({ metric }: { metric: MetricDef }) {
  const { lang } = useI18n();
  return <Panel id={sectionId('ownership')} title={lang === 'ko' ? '소유' : 'Ownership'} subtitle={lang === 'ko' ? '정의 책임과 발행 권한은 별개입니다 (Open).' : 'Definition ownership and publish permission are separate (Open).'}>
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
    <p className="mt-3 text-[12px] text-text-muted">{previous ? (lang === 'ko' ? `이전 v${previous.version} 대비 변경 ${diff.length}개 필드는 왼쪽 버전 영역에 있습니다.` : `${diff.length} field(s) differ from previous v${previous.version}; see Version.`) : (lang === 'ko' ? '비교할 이전 버전이 없습니다.' : 'No previous version to diff.')}</p>
  </Panel>;
}

function CoverageSection({ version, ids, rooms }: { version: MetricVersion; ids: string[]; rooms: string[] }) {
  const { lang, tx } = useI18n();
  const c = version.coverage;
  return <Panel id={sectionId('coverage')} title={lang === 'ko' ? '커버리지 기준' : 'Coverage basis'} subtitle={lang === 'ko' ? '정의 속성입니다. 실행 비율이 아니며 응답 envelope의 coverage %와 연결하지 않습니다.' : 'A definition attribute. Not a runtime rate, and not the response envelope’s coverage percent.'}>
    <dl>
      <Field label={lang === 'ko' ? '모집단' : 'Population'}>{tx(c.populationRef)}</Field>
      <Field label={lang === 'ko' ? '포함' : 'Included'}>{tx(c.includedBasis)}</Field>
      <Field label={lang === 'ko' ? '제외' : 'Excluded'}>{tx(c.excludedBasis)}</Field>
      <Field label={lang === 'ko' ? '분모 기준' : 'Denominator basis'}>{tx(c.denominatorBasis)}</Field>
      <Field label="sourceRef" mono>{c.sourceRef ?? (lang === 'ko' ? '미정' : 'Unset')}</Field>
    </dl>
    <p className="mt-3 text-[12px] font-semibold text-text-primary">{lang === 'ko' ? '실행 Coverage 값 없음' : 'No runtime coverage value'}</p>
    <p className="mt-1 text-[12px] text-text-secondary">
      {lang === 'ko'
        ? '아래 설비 ID는 정의의 모집단 규칙에 맞는 합성 예시입니다. 건수·비율로 읽지 않습니다. Selection으로 좁히지 않습니다.'
        : 'The equipment IDs below are synthetic examples matching the definition’s population rule. Do not read them as a count or a rate. Selection does not narrow them.'}
    </p>
    {ids.length === 0
      ? <p className="mt-2 text-[12px] text-text-secondary">{lang === 'ko' ? '예시 설비가 없습니다. 0%로 표시하지 않습니다.' : 'No example equipment. This is not shown as 0%.'}</p>
      : <ul className="mt-2 space-y-1">{ids.map(id => <li key={id} className="t-mono text-text-primary">{id}</li>)}</ul>}
    {rooms.length > 0 && <p className="mt-2 text-[12px] text-text-muted">room_name: <span className="t-mono">{rooms.join(', ')}</span></p>}
  </Panel>;
}
