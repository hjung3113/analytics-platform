// The closed set of dataset scenario tags (design log-test-datasets §3.1). Pure. The DB check `dataset_scenario_tags_check` carries the
// same list (drift test), so a tag outside it never reaches a row.

export const SCENARIO_TAGS = ['normal', 'exception', 'boundary', 'regression', 'file_boundary', 'carryover', 'partial_support'] as const;
export type ScenarioTag = (typeof SCENARIO_TAGS)[number];

export const isScenarioTag = (value: string): value is ScenarioTag => (SCENARIO_TAGS as readonly string[]).includes(value);

export const SHARE_SCOPES = ['private', 'workspace'] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];

export const DATASET_STATUSES = ['active', 'archived'] as const;
export type DatasetStatus = (typeof DATASET_STATUSES)[number];
