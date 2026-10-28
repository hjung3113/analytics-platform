import type { ResolveActorsResponse } from '../../../lib/api/actors';
import type { AnalyticsAreaDto } from '../../../lib/api/registry-reads';

export function teamName(
  area: AnalyticsAreaDto,
  resolved: ResolveActorsResponse | undefined,
): string | null {
  if (!area.owner_team_id) return null;
  const t = resolved?.teams.find((x) => x.id === area.owner_team_id);
  return t ? t.name : null;
}
