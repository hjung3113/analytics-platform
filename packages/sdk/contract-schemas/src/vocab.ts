// The closed vocabularies the schemas spell out. This package never imports @ap/contracts (it must stay dependency-free
// for a backend); src/vocab.test.ts compares every list below with the contracts' `OUTCOMES` and the hand-written unions.
export const OUTCOME_VALUES = ['ok', 'empty', 'error', 'forbidden', 'too_large', 'timeout'] as const;
export const ASSESSMENT_KINDS = ['collection', 'processing_delay', 'coverage', 'time_domain', 'respondent_history'] as const;
export const ASSESSMENT_STATES = ['confirmed', 'clear', 'unknown'] as const;
export const ASSESSMENT_REASONS = ['source_unavailable', 'check_failed'] as const;
export const CONTEXT_KEYS = ['time', 'roomNames', 'line', 'prcGroup', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric'] as const;
/** `unsupported` is the absence of a key in an endpoint's `context`, so it is not a value there. */
export const APPLIED_CAPABILITIES = ['apply', 'reference'] as const;
/** Column filter operators per field kind (ADR-0105); src/equivalence.test.ts compares each list with the contracts' lists. */
export const TEXT_FILTER_OPS = ['contains', 'notContains', 'startsWith', 'endsWith', 'equals', 'notEquals', 'isEmpty', 'isNotEmpty'] as const;
export const NUMBER_FILTER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'] as const;
export const DATE_FILTER_OPS = ['between', 'before', 'after', 'isEmpty', 'isNotEmpty'] as const;
export const INSTANT_FILTER_OPS = ['between', 'isEmpty', 'isNotEmpty'] as const;
export const ENUM_FILTER_OPS = ['in', 'notIn', 'isEmpty', 'isNotEmpty'] as const;
