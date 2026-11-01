// Type equivalence between the Zod sources and the hand-written @ap/contracts types (ADR-0096). `tsc --noEmit` (the package's
// `typecheck`) proves it; `vitest run` only loads the file, because `expectTypeOf` is a no-op at runtime.
import type { CreateNoticeInput, DeleteNoticeInput, GroupMember, JsonValue, Notice, NoticeListPage, PreferencesImport, PreferencesPatch, PreferencesSnapshot, SaveNoticeInput, UpdateNoticeInput, ApiResponse, Capability, Assessment, AssessmentKind, AnyEndpointSpec, ColumnFilter, ColumnFilterSpec, MenuQuery, MenuQueryContext, Outcome, Trust } from '@ap/contracts';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import {
  apiResponseSchema,
  assessmentKindSchema,
  assessmentSchema,
  columnFilterSchema,
  columnFilterSpecSchema,
  endpointDeclarationSchema,
  menuQueryContextSchema,
  menuQuerySchema,
  outcomeSchema,
  trustSchema,
  createNoticeInputSchema,
  deleteNoticeInputSchema,
  groupMemberSchema,
  jsonValueSchema,
  noticeListPageSchema,
  noticeSchema,
  peopleLookupResponseSchema,
  preferencesImportSchema,
  preferencesPatchSchema,
  preferencesSnapshotSchema,
  saveNoticeInputSchema,
  updateNoticeInputSchema,
} from './index.ts';
import { contextCapabilitySchema } from './menu-query.ts';
import { APPLIED_CAPABILITIES } from './vocab.ts';

/** Readonly arrays and properties are a source-type nicety; the wire shape is mutable. Mapping also flattens intersections. */
type Wire<T> = T extends readonly (infer U)[] ? Wire<U>[] : T extends object ? { -readonly [K in keyof T]: Wire<T[K]> } : T;

// The contracts type with its three non-wire parts replaced: the branded `Permission` is a plain string on the wire, `paramKeys`
// is the key list of the runtime allow-list, and the phantom `_types` is dropped.
type EndpointDeclaration = Omit<AnyEndpointSpec, '_types' | 'paramKeys' | 'permission'> & { paramKeys: string[]; permission: string };

describe('schemas and @ap/contracts types are the same type', () => {
  it('outcome and assessment kind', () => {
    expectTypeOf<z.infer<typeof outcomeSchema>>().toEqualTypeOf<Outcome>();
    expectTypeOf<z.infer<typeof assessmentKindSchema>>().toEqualTypeOf<AssessmentKind>();
  });

  it('assessment and trust', () => {
    expectTypeOf<Wire<z.infer<typeof assessmentSchema>>>().toEqualTypeOf<Wire<Assessment>>();
    expectTypeOf<Wire<z.infer<typeof trustSchema>>>().toEqualTypeOf<Wire<Trust>>();
  });

  it('ApiResponse<unknown>', () => {
    const schema = apiResponseSchema(z.unknown());
    expectTypeOf<Wire<z.infer<typeof schema>>>().toEqualTypeOf<Wire<ApiResponse<unknown>>>();
  });

  it('menu query and its context', () => {
    expectTypeOf<Wire<z.infer<typeof menuQueryContextSchema>>>().toEqualTypeOf<Wire<MenuQueryContext>>();
    expectTypeOf<Wire<z.infer<typeof menuQuerySchema>>>().toEqualTypeOf<Wire<MenuQuery>>();
  });

  it('declarable capabilities are Capability without unsupported', () => {
    expectTypeOf<z.infer<typeof contextCapabilitySchema>>().toEqualTypeOf<Exclude<Capability, 'unsupported'>>();
    expectTypeOf<(typeof APPLIED_CAPABILITIES)[number]>().toEqualTypeOf<Exclude<Capability, 'unsupported'>>();
  });

  it('endpoint declaration (data part of EndpointSpec)', () => {
    expectTypeOf<Wire<z.infer<typeof endpointDeclarationSchema>>>().toEqualTypeOf<Wire<EndpointDeclaration>>();
  });

  it('preferences, people and notices ports (ADR-0098)', () => {
    expectTypeOf<z.infer<typeof jsonValueSchema>>().toEqualTypeOf<JsonValue>();
    expectTypeOf<Wire<z.infer<typeof preferencesSnapshotSchema>>>().toEqualTypeOf<Wire<PreferencesSnapshot>>();
    expectTypeOf<Wire<z.infer<typeof preferencesPatchSchema>>>().toEqualTypeOf<Wire<PreferencesPatch>>();
    expectTypeOf<Wire<z.infer<typeof preferencesImportSchema>>>().toEqualTypeOf<Wire<PreferencesImport>>();
    expectTypeOf<Wire<z.infer<typeof groupMemberSchema>>>().toEqualTypeOf<Wire<GroupMember>>();
    expectTypeOf<Wire<z.infer<typeof peopleLookupResponseSchema>>['items']>().toEqualTypeOf<Wire<GroupMember>[]>();
    expectTypeOf<Wire<z.infer<typeof noticeSchema>>>().toEqualTypeOf<Wire<Notice>>();
    expectTypeOf<Wire<z.infer<typeof noticeListPageSchema>>>().toEqualTypeOf<Wire<NoticeListPage>>();
    expectTypeOf<Wire<z.infer<typeof createNoticeInputSchema>>>().toEqualTypeOf<Wire<CreateNoticeInput>>();
    expectTypeOf<Wire<z.infer<typeof updateNoticeInputSchema>>>().toEqualTypeOf<Wire<UpdateNoticeInput>>();
    expectTypeOf<Wire<z.infer<typeof saveNoticeInputSchema>>>().toEqualTypeOf<Wire<SaveNoticeInput>>();
    expectTypeOf<Wire<z.infer<typeof deleteNoticeInputSchema>>>().toEqualTypeOf<Wire<DeleteNoticeInput>>();
  });

  it('column filter and its field spec (ADR-0105)', () => {
    expectTypeOf<Wire<z.infer<typeof columnFilterSchema>>>().toEqualTypeOf<Wire<ColumnFilter>>();
    expectTypeOf<Wire<z.infer<typeof columnFilterSpecSchema>>>().toEqualTypeOf<Wire<ColumnFilterSpec>>();
  });
});
