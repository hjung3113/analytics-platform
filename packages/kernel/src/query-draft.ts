import { useHostPlatform } from './platform';
import type { GlobalContext, Pair, Text } from '@ap/contracts';

export type QueryMissing = { key: string; label: Text };
export type QueryDraft = {
  mode: 'live' | 'apply';
  draft: { global: GlobalContext; page: Pair[] };
  dirty: readonly string[];
  setDraftGlobal: (patch: Partial<GlobalContext>) => void;
  setDraftPage: (patch: Record<string, string | null>) => void;
  apply: () => void;
  revert: () => void;
  reset: () => void;
  missing: readonly QueryMissing[];
  canApply: boolean;
  /** Commit dispatch is pending until the end of this turn. Controlled address acknowledgement is tracked separately from request loading. */
  applying: boolean;
};

/** One draft per logical screen; existing applied writers remain immediate. */
export function useQueryDraft(): QueryDraft { return useHostPlatform().queryDraft; }
