// THROWAWAY #595 — never merge.
import { managedSystemFor } from '../feedbackops-systems';

/** Only the spaces the real mapping gives a FeedbackOps block (ADR-0045) draw one. */
export const feedbackOpsManaged = (spaceId: string) => managedSystemFor(spaceId) !== null;
