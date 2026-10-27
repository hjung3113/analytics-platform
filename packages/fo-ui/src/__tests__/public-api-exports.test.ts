import * as publicApi from '../index.js';

const EXPECTED_EXPORTS = `
AnalyticsAreaPicker
ENTITY_ICON_MAP
EntityIconBadge
InternalTaskBadge
LinkedEntityTrail
ManagedSystemMark
ManagedSystemPicker
ManagedSystemPill
OutlineBadge
ReporterStatusBadge
SEVERITY_LABELS
SeverityBadge
TabsList
TabsTrigger
UnassignedBadge
managedSystemMarkColor
managedSystemMarkToken
useDetailPanelSlot
`
  .trim()
  .split(/\s+/);

it('keeps the public runtime export names stable', () => {
  expect(Object.keys(publicApi).sort()).toEqual(EXPECTED_EXPORTS);
});
