import { AnalysisWorkspaceArchetype, CatalogArchetype, ManagementArchetype, OverviewArchetype, WorkflowArchetype } from './PageArchetypes';
const overview = { primarySummary: null, mainTrend: null, attentionList: null };
const analysis = { kpiSummary: null, primaryChart: null, selectionAnnotation: null, breakdownTable: null };
const management = { searchFilter: null, dataTable: null, selectionActions: null, detailDrawer: null, historyAudit: null };
const catalog = { catalogList: null, definitionDetail: null, version: null, ownership: null, coverage: null, usageDependency: null, history: null };
const workflow = { queueList: null, statusFilter: null, detail: null, timeline: null, comments: null, relatedContext: null };
<OverviewArchetype {...overview} />; <AnalysisWorkspaceArchetype {...analysis} />; <ManagementArchetype {...management} />; <CatalogArchetype {...catalog} />; <WorkflowArchetype {...workflow} />;
// @ts-expect-error children are not a region
<OverviewArchetype {...overview}><div /></OverviewArchetype>;
// @ts-expect-error Page Header is a Shell slot, not an archetype region
<OverviewArchetype {...overview} title="Page header" />;
// @ts-expect-error every region must be explicit, including null regions
<OverviewArchetype primarySummary={null} mainTrend={null} />;
// @ts-expect-error children are not a region
<AnalysisWorkspaceArchetype {...analysis}><div /></AnalysisWorkspaceArchetype>;
// @ts-expect-error Data Trust is a Shell slot, not an archetype region
<AnalysisWorkspaceArchetype {...analysis} dataTrustSummary="trust" />;
// @ts-expect-error every region must be explicit, including null regions
<AnalysisWorkspaceArchetype kpiSummary={null} primaryChart={null} selectionAnnotation={null} />;
// @ts-expect-error children are not a region
<ManagementArchetype {...management}><div /></ManagementArchetype>;
// @ts-expect-error Global Context is a Shell slot, not an archetype region
<ManagementArchetype {...management} contextExtension={null} />;
// @ts-expect-error every region must be explicit, including null regions
<ManagementArchetype searchFilter={null} dataTable={null} selectionActions={null} detailDrawer={null} />;
// @ts-expect-error children are not a region
<CatalogArchetype {...catalog}><div /></CatalogArchetype>;
// @ts-expect-error a region of another archetype is rejected
<CatalogArchetype {...catalog} dataTable={null} />;
// @ts-expect-error every region must be explicit, including null regions
<CatalogArchetype catalogList={null} definitionDetail={null} version={null} ownership={null} coverage={null} usageDependency={null} />;
// @ts-expect-error children are not a region
<WorkflowArchetype {...workflow}><div /></WorkflowArchetype>;
// @ts-expect-error a region of another archetype is rejected
<WorkflowArchetype {...workflow} detailDrawer={null} />;
// @ts-expect-error every region must be explicit, including null regions
<WorkflowArchetype queueList={null} statusFilter={null} detail={null} timeline={null} comments={null} />;
