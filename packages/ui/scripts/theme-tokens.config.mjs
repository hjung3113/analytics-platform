/** Generic semantic and platform-owned colour roles published by @ap/ui/theme. */
export const includePrefixes = [
  'text-',
  'surface-',
  'border-',
  'focus-ring',
  'accent-',
  'severity-',
  'chart-',
  'cat-',
  'icon-',
];

/** Product-domain and raw palette roles intentionally kept out of the public contract. */
export const exclude = {
  'color-': 'Raw palette primitives are implementation details; components consume semantic roles.',
  'status-reporter-': 'FeedbackOps VOC reporter status is a product-domain role.',
  'status-internal-': 'FeedbackOps Task workflow status is a product-domain role.',
  'accent-voc': 'FeedbackOps VOC identity accent is a product-domain role.',
  'accent-task': 'FeedbackOps Task identity accent is a product-domain role.',
  'entity-icon-': 'FeedbackOps entity icon identities are a product-domain role.',
  'managed-system-': 'FeedbackOps managed-system identities are a product-domain role.',
  'confidence-': 'Confidence levels are used only by the FeedbackOps copy and its prototypes; the platform has no consumer.',
};
