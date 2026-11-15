import type { SeverityEnum } from '@ap/ui';

// Feature-local label table used by SeverityBadge; @ap/ui does not expose it.
export const SEVERITY_LABELS: Record<SeverityEnum, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
  critical: '심각',
};
