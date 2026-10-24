// THROWAWAY #595 — never merge.
// The mock server's role (개발자 also gets admin: the mock has no per-system grants, the proto draws the scope): 담당자 = admin (holds feedbackops:access), 신고자 = the default engineer (does not).
import { setRole } from '@ap/mock-server';
import { PROTO } from '../proto/state';

export function applyPersonaRole() {
  if (PROTO.variant !== null) setRole(PROTO.persona === 'reporter' ? 'engineer' : 'admin');
}
