// THROWAWAY #423 — never merge.
import { ExternalLink, Rocket, ScrollText } from 'lucide-react';
import type { ProtoFixedItem } from '@ap/ui';

export const FIXED: ProtoFixedItem[] = [
  { id: 'feedbackops', label: 'FeedbackOps', reason: '연결 준비 중', section: 'external', icon: ExternalLink },
  { id: 'logdev', label: '표준 로그 개발', reason: '아직 사용할 수 없습니다', section: 'planned', icon: ScrollText },
  { id: 'improve', label: '개선 실행', reason: '아직 사용할 수 없습니다', section: 'planned', icon: Rocket },
];
