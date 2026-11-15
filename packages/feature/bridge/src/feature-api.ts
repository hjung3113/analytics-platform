/**
 * Menu-owned slot for the feature API the bridge screens call (platform ADR-0071).
 * The app composition root injects it from the assembly; Kernel and PlatformAdapter never learn it. Imports nothing from
 * Feature so main.tsx can import it without pulling feature code out of the lazy page chunk. Unset (mock) → null.
 */
export type FeatureApi = { basePath: string; onSessionLost: () => void };

let current: FeatureApi | null = null;

export function setFeatureApi(value: FeatureApi | null): void { current = value; }

export function featureApi(): FeatureApi | null { return current; }
