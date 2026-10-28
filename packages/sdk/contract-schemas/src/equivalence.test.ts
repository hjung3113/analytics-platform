// Type equivalence between the Zod sources and the hand-written @ap/contracts types (ADR-0096). `tsc --noEmit` (the package's
// `typecheck`) proves it; `vitest run` only loads the file, because `expectTypeOf` is a no-op at runtime.
import type { ApiResponse, Assessment, AssessmentKind, AnyEndpointSpec, MenuQuery, MenuQueryContext, Outcome, Trust } from '@ap/contracts';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import {
  apiResponseSchema,
  assessmentKindSchema,
  assessmentSchema,
  endpointDeclarationSchema,
  menuQueryContextSchema,
  menuQuerySchema,
  outcomeSchema,
  trustSchema,
} from './index.ts';

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

  it('endpoint declaration (data part of EndpointSpec)', () => {
    expectTypeOf<Wire<z.infer<typeof endpointDeclarationSchema>>>().toEqualTypeOf<Wire<EndpointDeclaration>>();
  });
});
