/**
 * Menu-owned slot for the FeedbackOps API the bridge screens call (platform ADR-0071, the #60 feedbackops-origin pattern).
 * The app composition root injects it from the assembly; Kernel and PlatformAdapter never learn it. Imports nothing from
 * FeedbackOps so main.tsx can import it without pulling FeedbackOps code out of the lazy page chunk. Unset (mock) → null.
 */
export type FeatureApi = { basePath: string; onSessionLost: () => void };

let current: FeatureApi | null = null;

export function setFeatureApi(value: FeatureApi | null): void { current = value; }

export function featureApi(): FeatureApi | null { return current; }
