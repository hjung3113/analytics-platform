import type { ConformanceCheck, ServerConformanceHarness } from '../../types';
import { planAnnotationChecks } from './annotations';
import { planClientErrorChecks } from './client-error';
import { planConsoleChecks } from './console';
import { planEntityAuditChecks } from './entity-audit';
import { planEntityChecks } from './entity';
import { planServiceChecks } from './services';
import { planSiteChecks } from './sites';
import { planSnapshotChecks } from './snapshots';
import { planSavedViewChecks } from './saved-views';
import type { AtSite } from './shared';
import { planUsageChecks } from './usage';

/**
 * The port checks beyond menuQuery (#152, checklist §2). Session/subscribe/validateScope are non-envelope
 * methods — they answer their own types, so a throw there is reported as the method throwing, not as a
 * missing envelope.
 */
export function planPortChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const entityRef = harness.ports.entity.ref;
  // Entity checks that only mean something for a site-scoped destination type (skipped for a siteless sample).
  const siteEntityChecks = new Set<ConformanceCheck>();
  const atSite: AtSite = check => {
    siteEntityChecks.add(check);
    return check;
  };
  const checks: ConformanceCheck[] = [
    ...planSiteChecks(harness),
    ...planSnapshotChecks(harness),
    ...planEntityChecks(harness, atSite),
    ...planEntityAuditChecks(harness, atSite),
    ...planConsoleChecks(harness),
    ...planAnnotationChecks(harness),
    ...planUsageChecks(harness),
    ...planClientErrorChecks(harness),
    ...planServiceChecks(harness),
    ...planSavedViewChecks(harness),
  ];
  const siteScopedEntity = entityRef.scopeId !== null;
  for (const check of siteEntityChecks) {
    // A siteless destination type answers `scopeId: null` (checklist §2 entityAudit): no site to refuse, no room to re-check.
    if (!siteScopedEntity && check.mode !== 'skipped') {
      check.mode = 'skipped';
      check.id += ' — siteless destination type';
    }
  }
  return checks;
}
