import { expectTypeOf, it } from 'vitest';
import type { UseLinkEvidenceArgs, useLinkEvidenceMutation } from '../useEvidenceMutations';

type LinkResponse = { id: string; relation_type: 'evidence_of' };

it('types link-evidence as the server metadata response, including its success callback', () => {
  expectTypeOf<Awaited<ReturnType<ReturnType<typeof useLinkEvidenceMutation>['mutateAsync']>>>()
    .toEqualTypeOf<LinkResponse>();
  expectTypeOf<Parameters<NonNullable<UseLinkEvidenceArgs['onSuccess']>>[0]>()
    .toEqualTypeOf<LinkResponse>();
});
