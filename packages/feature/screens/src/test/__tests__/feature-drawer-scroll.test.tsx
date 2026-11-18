import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { getEvidenceInventoryResponseSchema } from '@ap/feature-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEvidencePanelParts } from '../../features/integration/components/EvidencePanel';
import { HostSeamProvider } from '../../lib/host/host-seam';

const root = resolve(import.meta.dirname, '../../../../../..');
const source = resolve(root, 'packages/feature/screens/src/features');
// Stateful bodies depend on query/session/permission providers and workflow mutations. Scan their
// local JSX dependencies as well as the parts module, rather than replacing those bodies with mocks.
const bodies = {
  FeatureAnalyticsAreas: 'admin/analytics-areas/AnalyticsAreaDetail.tsx',
  TaskDrawers: 'tasks/components/TaskDetailParts.tsx',
  MilestoneCreate: 'tasks/components/milestone-detail/useMilestoneCreateParts.tsx',
  FeatureTaskRequests: 'tasks/routes/task-requests/TaskRequestPanelParts.tsx',
  FeatureMilestones: 'tasks/components/milestone-detail/useMilestoneDetailParts.tsx',
  FeaturePermissionRequests: 'admin/permissions/permission-request-detail.tsx',
  FeaturePermissionGrants: 'admin/permissions/permission-grant-detail.tsx',
  FeaturePermissionGroups: 'admin/permissions/permission-groups-screen.tsx',
  ServiceTokens: 'api-tokens/TokenIssueDrawer.tsx',
  ApiTokens: 'api-tokens/TokenIssueDrawer.tsx',
  FeatureIntegration: 'integration/recovery/RecoveryPanel.tsx',
  ClusterDetailDrawer: 'voc-cluster/components/detail/VocClusterDetailPanel.tsx',
  FindingDrawer: 'findings/components/FindingDetail/FindingDetailParts.tsx',
  FeatureEvidence: 'integration/components/EvidencePanel.tsx',
  SurveyDrawer: 'surveys/components/detail/SurveyDetailParts.tsx',
  FeatureSurveyFollowUp: 'surveys/components/results/OutcomeFollowUpReview.tsx',
};

// These exact existing bounded pickers are independent interactive surfaces, not drawer reading bodies.
const exemptions = [
  { module: 'voc-cluster/components/modals/CreateFindingFromClusterModal.tsx', classes: 'flex max-h-52 flex-col gap-2 overflow-y-auto', reason: 'Portaled create-Finding dialog bounds its evidence VOC checklist so the form and submit button stay on screen (#2531).' },
  { module: 'voc-cluster/components/modals/AddVocModal.tsx', classes: 'flex max-h-[50vh] flex-col gap-1 overflow-y-auto', reason: 'Portaled Add VOC dialog candidate list has a separate viewport, outside the drawer body.' },
  { module: 'tasks/routes/task-requests/TaskRequestDecisionSection.tsx', classes: 'max-h-52 overflow-y-auto rounded border border-border-subtle bg-surface-card', reason: 'Existing Task link picker bounds candidate rows while the decision section remains visible.' },
  { module: 'cross-system/mentions/MentionPickerButton.tsx', classes: 'max-h-48 overflow-y-auto py-1', reason: 'Portaled mention combobox listbox; keyboard navigation needs its own scroll viewport.' },
  { module: 'findings/components/FindingDetail/SurveyEvidencePicker.tsx', classes: 'max-h-48 overflow-y-auto', reason: 'Existing approved-excerpt radio picker bounds its selectable candidate list, not the reading body.' },
];

function boundedScroll(classes: string, inlineHeight = false) {
  const tokens = classes.split(/\s+/).map(token => token.split(':').at(-1) ?? '');
  return tokens.some(token => /^(overflow-y-(auto|scroll)|overflow-auto)$/.test(token)) &&
    (inlineHeight || tokens.some(token => /^(max-h-|h-)/.test(token) && !['h-full', 'h-auto'].includes(token)));
}

function violations(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const failures: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const classes = attributes.find(attribute => attribute.name.getText(tree) === 'className');
      const style = attributes.find(attribute => attribute.name.getText(tree) === 'style');
      if (classes && boundedScroll(classes.initializer?.getText(tree).replace(/["'`{}]/g, '') ?? '', /(?:maxHeight|height)\s*:/.test(style?.getText(tree) ?? ''))) {
        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
        const exempt = exemptions.some(entry => entry.module === file.slice(source.length + 1) && classes.initializer && ts.isStringLiteral(classes.initializer) && entry.classes === classes.initializer.text && entry.reason.length > 0);
        if (!exempt) failures.push(`${file.slice(source.length + 1)}:${line}: ${classes.getText(tree)}`);
      }
    }
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith('.')) {
        const base = resolve(dirname(file), specifier);
        // Follow local feature components; shared SDK primitives and portals have their own contracts.
        const dependency = [base, `${base}.tsx`, resolve(base, 'index.tsx')].find(path => path.endsWith('.tsx') && existsSync(path));
        if (dependency?.startsWith(source)) failures.push(...violations(dependency, seen));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return failures;
}

afterEach(cleanup);

describe('feature drawer single scroll region', () => {
  it('keeps coverage aligned with every platform FeatureDetailDrawer consumer', () => {
    const platform = resolve(root, 'platform');
    const consumers = readdirSync(platform).flatMap(group => {
      const pages = resolve(platform, group, 'src/pages');
      return existsSync(pages) ? readdirSync(pages, { recursive: true }).map(path => `${group}/src/pages/${String(path)}`) : [];
    })
      .filter(path => path.endsWith('.tsx') && !path.includes('.test.'))
      .filter(path => /import\s*\{[^}]*\bFeatureDetailDrawer\b[^}]*\}\s*from/.test(readFileSync(resolve(platform, path), 'utf8')))
      .map(path => (path.split('/').at(-1) ?? '').replace('.tsx', '')).sort();
    expect(consumers).toEqual(Object.keys(bodies).filter(name => name !== 'MilestoneCreate').sort());
  });

  it.each(Object.entries(bodies))('%s has no height-bounded second vertical scroller in its body modules', (_name, path) => {
    expect(violations(resolve(source, path))).toEqual([]);
  });

  it.each(['max-h-48 overflow-y-auto', 'h-48 overflow-auto', 'h-screen overflow-y-scroll'])('rejects %s', classes => {
    expect(boundedScroll(classes)).toBe(true);
  });
  it('rejects inline maximum height but permits horizontal scrolling and unbounded bodies', () => {
    expect(boundedScroll('overflow-y-auto', true)).toBe(true);
    expect(boundedScroll('h-full overflow-y-auto')).toBe(false);
    expect(boundedScroll('h-auto overflow-auto')).toBe(false);
    expect(boundedScroll('max-h-48 overflow-x-auto')).toBe(false);
  });

  const evidence = getEvidenceInventoryResponseSchema.parse({
    id: '11111111-1111-4111-8111-111111111111', finding_id: '22222222-2222-4222-8222-222222222222',
    primary_managed_system_id: '33333333-3333-4333-8333-333333333333', analytics_area_id: null,
    sentiment: null, importance: null, created_at: '2026-11-17T00:00:00.000Z',
    finding: { id: '22222222-2222-4222-8222-222222222222', display_id: 'FIN-1', title: 'Preview finding' },
    source_type: 'note', content_state: 'available', quote_or_summary: 'Preview evidence. '.repeat(100),
  });
  it.each(['available', 'loading', 'empty', 'mismatch', 'error'] as const)('renders the real Evidence body without a second bounded scroller: %s', state => {
    const parts = buildEvidencePanelParts({ item: state === 'available' ? evidence : undefined, loading: state === 'loading', mismatch: state === 'mismatch', error: state === 'error' ? new Error('failed') : null, onClose: vi.fn(), onRetry: vi.fn() });
    const { container } = render(<HostSeamProvider value={{ canLink: () => false, Link: ({ children }) => <span>{children}</span>, notifyError: vi.fn(), notifySuccess: vi.fn(), useSearch: () => ({}), useNavigate: () => () => undefined }}>
      <div className="fo-detail-body overflow-y-auto">{parts.body}</div>
    </HostSeamProvider>);
    const body = container.querySelector('.fo-detail-body');
    if (!body) throw new Error('Evidence drawer body did not render');
    const nested = [...body.querySelectorAll<HTMLElement>('*')].filter(node => boundedScroll(node.className, Boolean(node.style.maxHeight || node.style.height)));
    expect(nested).toEqual([]);
  });
});
