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
  'status-reporter-': 'Feature VOC reporter status is a product-domain role.',
  'status-internal-': 'Feature Task workflow status is a product-domain role.',
  'accent-voc': 'Feature VOC identity accent is a product-domain role.',
  'accent-task': 'Feature Task identity accent is a product-domain role.',
  'surface-field': 'Transparent field background, not a colour role.',
  'entity-icon-': 'Feature entity icon identities are a product-domain role.',
  'managed-system-': 'Feature managed-system identities are a product-domain role.',
  'confidence-': 'Confidence levels are used only by the feature copy and its prototypes; the platform has no consumer.',
};
