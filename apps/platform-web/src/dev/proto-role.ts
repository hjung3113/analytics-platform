// THROWAWAY #595 — never merge.
// The mock server's role: 담당자 = admin (holds feedbackops:access), 신고자 = the default engineer (does not).
import { setRole } from '@ap/mock-server';
import { PROTO } from '../proto/state';

export function applyPersonaRole() {
  if (PROTO.variant !== null) setRole(PROTO.persona === 'staff' ? 'admin' : 'engineer');
}
