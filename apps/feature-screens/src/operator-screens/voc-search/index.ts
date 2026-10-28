// The platform bridge's entry for FeedbackOps' own VOC search rules (platform ADR-0071 decision 9, ADR-0081). A host that keeps the query in its
// own URL asks it whether a page value is one FeedbackOps would accept, so it can reject (not substitute) a bad one before mounting a screen.
// Same import-graph rules as `global-screens`: no router, `routes/**`, `lib/router/**`, `lib/layout/**`, `lib/auth/**` or `sonner`.
export { isVocSearchValueValid } from '@/features/voc/routes/voc-search';
