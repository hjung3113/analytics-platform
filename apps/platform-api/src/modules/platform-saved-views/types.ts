// Wire types inferred from the shared Zod schemas (@ap/contract-schemas), never copied by hand.

import type {
  savedViewCommandSchema,
  savedViewDraftSchema,
  savedViewEntrySchema,
  savedViewImportOutcomeSchema,
  savedViewListItemSchema,
  savedViewPatchSchema,
  savedViewResponseSchemas,
  savedViewSchema,
  viewVisibilitySchema,
} from '@ap/contract-schemas';

type Out<S extends { _output: unknown }> = S['_output'];

export type SavedViewCommandIn = Out<typeof savedViewCommandSchema>;
export type SavedViewDraftIn = Out<typeof savedViewDraftSchema>;
export type SavedViewPatchIn = Out<typeof savedViewPatchSchema>;
export type ViewVisibilityIn = Out<typeof viewVisibilitySchema>;
export type SavedViewJson = Out<typeof savedViewSchema>;
export type SavedViewEntryJson = Out<typeof savedViewEntrySchema>;
export type SavedViewListItemJson = Out<typeof savedViewListItemSchema>;
export type ImportOutcomeJson = Out<typeof savedViewImportOutcomeSchema>;
export type ResponseOf<Op extends keyof typeof savedViewResponseSchemas> = Out<
  (typeof savedViewResponseSchemas)[Op]
>;
export type CommandOf<Op extends SavedViewCommandIn['op']> = Extract<
  SavedViewCommandIn,
  { op: Op }
>;

export type Failure = {
  ok: false;
  reason: 'conflict' | 'forbidden' | 'unavailable' | 'invalid';
  detail?: string;
};
export type Ok<T> = { ok: true; value: T };
export type ResultOf<T> = Ok<T> | Failure;
export const fail = (reason: Failure['reason'], detail?: string): Failure => ({
  ok: false,
  reason,
  ...(detail ? { detail } : {}),
});
