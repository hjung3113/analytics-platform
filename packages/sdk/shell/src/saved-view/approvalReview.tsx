import { createContext } from 'react';
import type { ApprovalRequestInfo, SavedView } from '@ap/contracts';
import type { ApprovalReviewFrameProps } from './ApprovalReviewFrame';

export type ReviewCopy = { view: Extract<SavedView, { kind: 'menu-view' }>; href: string };
export type ApprovalReview = {
  proposal: ReviewCopy | { view: ReviewCopy['view']; reason: string };
  approved?: ReviewCopy;
  request?: ApprovalRequestInfo;
  requester: string;
  frame: Pick<ApprovalReviewFrameProps, 'scope' | 'canDecide' | 'canApprove' | 'canWithdraw' | 'onAction'>;
};
export const OpenApprovalReview = createContext<((review: ApprovalReview) => void) | null>(null);
