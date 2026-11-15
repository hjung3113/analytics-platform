import type { ClientErrorReport } from '@ap/contracts';
import type { ConformanceCheck, ServerConformanceHarness } from '../../types';

export function planClientErrorChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter, ports } = harness;
  const checks: ConformanceCheck[] = [];
  // Client error reports (checklist §2 fire-and-forget): identity fields only — no URL, no Context value, no
  // free-text message. The sample-accepted check is the positive control: a server that rejects everything would
  // pass every rejection check, so that one must fail it.
  const badErrorReport = (patch: Record<string, unknown>): ClientErrorReport => ({ ...ports.clientError, ...patch }) as unknown as ClientErrorReport;
  const expectReported = (report: ClientErrorReport, accepted: boolean, why: string) => async () => {
    const r = await adapter.reportClientError(report);
    return r.accepted === accepted ? null : `${why}: expected accepted ${accepted}, got ${r.accepted}`;
  };
  checks.push({
    id: 'port · reportClientError accepts the sample',
    uses: ['reportClientError'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(ports.clientError, true, 'the sample report is the declared wire shape'),
  });
  // Same space rule as recordUsage: clone the sample with spaceId null, and reject a malformed space id.
  checks.push({
    id: 'port · reportClientError accepts a global menu (spaceId null)',
    uses: ['reportClientError'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported({ ...ports.clientError, spaceId: null }, true, 'a global menu (spaceId null)'),
  });
  checks.push({
    id: 'port · reportClientError: a malformed spaceId is rejected',
    uses: ['reportClientError'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ spaceId: 'a b' }), false, 'a space id with whitespace'),
  });
  checks.push({
    id: 'port · reportClientError: an unknown key (free-text message) is rejected',
    uses: ['reportClientError'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ message: 'Cannot read properties of undefined (lot L-123)' }), false, 'a free-text message is an unknown key'),
  });
  checks.push({
    id: 'port · reportClientError: an absolute URL path is rejected',
    uses: ['reportClientError'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ path: 'https://example.com/equipment' }), false, 'an absolute URL — only the app-relative manifest route pattern travels'),
  });
  checks.push({
    id: 'port · reportClientError: a path with a query is rejected',
    uses: ['reportClientError'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ path: `${ports.clientError.path}?scopeId=MEM` }), false, 'a path with a query string'),
  });
  checks.push({
    id: 'port · reportClientError: a free-text name is rejected',
    uses: ['reportClientError'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(badErrorReport({ name: 'TypeError: lot L-123 missing' }), false, 'a free-text name — name is identifier-shaped only'),
  });
  const { name: _reportedName, ...reportWithoutName } = ports.clientError;
  checks.push({
    id: 'port · reportClientError: a missing field is rejected',
    uses: ['reportClientError'],
    mode: 'granted',
    nonEnvelope: true,
    run: expectReported(reportWithoutName as ClientErrorReport, false, 'a report missing its name'),
  });
  return checks;
}
