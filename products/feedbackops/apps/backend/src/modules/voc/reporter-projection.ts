// One reporter-arm wire projection (#1173, #696): the internal-triage fields a
// reporter must not see. Absent = hidden; null = visible but unset.
export function operatorOnlyVocFields(
  row: {
    severity: 'low' | 'medium' | 'high' | 'critical' | null;
    analyticsAreaId: string | null;
    ownerUserId: string | null;
    ownerTeamId: string | null;
  },
  isReporterArm: boolean,
): {
  severity?: 'low' | 'medium' | 'high' | 'critical' | null;
  analytics_area_id?: string | null;
  owner_user_id?: string | null;
  owner_team_id?: string | null;
} {
  if (isReporterArm) return {};
  return {
    severity: row.severity,
    analytics_area_id: row.analyticsAreaId,
    owner_user_id: row.ownerUserId,
    owner_team_id: row.ownerTeamId,
  };
}
