import { recoveryCategorySchema } from '@fops/shared';
import { z } from 'zod';

import { returnToField, safeRecoveryReturnTo } from '@/lib/host/search-fields';

export { safeRecoveryReturnTo };
export const recoverySearchFields = {
  category: recoveryCategorySchema.optional(),
  selected: z
    .string()
    .regex(/^r1_[A-Za-z0-9_-]{23}$/)
    .optional(),
  presentation: z
    .enum(['visible', 'hidden'])
    .transform((value) => (value === 'visible' ? undefined : value))
    .optional(),
  history: z
    .boolean()
    .transform((value) => (value ? true : undefined))
    .optional(),
  returnTo: returnToField,
  cursor: z.string().min(1).max(4096).optional(),
};
export interface RecoverySearch {
  managedSystem?: string;
  category?: z.infer<typeof recoveryCategorySchema>;
  selected?: string;
  presentation?: 'hidden';
  history?: boolean;
  returnTo?: string;
  cursor?: string;
}
