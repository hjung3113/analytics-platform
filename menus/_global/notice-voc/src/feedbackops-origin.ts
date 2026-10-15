/**
 * Menu-owned slot for the FeedbackOps origin (issue #60 §4). Kernel, @ap/components, @ap/shell and
 * PlatformAdapter never learn FeedbackOps; the app composition root injects the value (step 3). Menus
 * never import the app. Missing env → null → links render disabled and the data still loads.
 */
let current: string | null = null;

export function setFeedbackOpsOrigin(value: string | null): void { current = value; }

export function feedbackOpsOrigin(): string | null { return current; }
