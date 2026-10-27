import { EvidenceRoute } from '@/features/integration/routes/EvidenceRoute';
import { validateEvidenceSearch } from '@/features/integration/routes/integration-search';
import { createFileRoute } from '@tanstack/react-router';

export {
  evidenceSearchSchema,
  validateEvidenceSearch,
} from '@/features/integration/routes/integration-search';
export const Route = createFileRoute('/_authed/integration/evidence')({
  validateSearch: validateEvidenceSearch,
  component: EvidenceRoute,
});
