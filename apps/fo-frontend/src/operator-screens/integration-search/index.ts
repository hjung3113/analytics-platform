// The platform bridge's entry for FeedbackOps' own 연동 search rules (platform ADR-0071 decision 9, ADR-0081): one validator per 연동 screen
// (dashboard, evidence, coverage, links). A host that keeps the query in its own URL asks it whether a page value is one FeedbackOps would accept,
// so it can reject (not substitute) a bad one before mounting a screen.
// Same import-graph rules as `voc-search`: no router, `routes/**`, `lib/router/**`, `lib/layout/**`, `lib/auth/**` or `sonner`.
export {
  isEvidenceSearchValueValid,
  isIntegrationCoverageSearchValueValid,
  isIntegrationDashboardSearchValueValid,
  isIntegrationLinksSearchValueValid,
} from '@/features/integration/routes/integration-search';
