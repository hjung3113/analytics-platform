import type { ContextKey } from './menu';
import type { AnyEndpointSpec } from './menu-query';
import type { Text } from '../i18n';

export type PanelContextKey = ContextKey | 'scopeId';

/** URL-shareable analysis selection shapes (ADR-0175). */
export type AnalysisSelectionShape = 'set' | 'range';
/** Selected values or opaque range endpoints (ADR-0175). */
export type AnalysisSelection =
  | { readonly shape: 'set'; readonly values: readonly string[] }
  | { readonly shape: 'range'; readonly from: string; readonly to: string };
/** How a receiving panel applies an analysis selection (ADR-0175). */
export type AnalysisSelectionUse = 'filter' | 'highlight';

export type PanelInputs<K extends string = string> = {
  readonly context?: readonly PanelContextKey[];
  /** Inputs that read an analysis selection output key declare how they apply it (ADR-0175). */
  readonly page?: readonly { readonly key: K; readonly required?: boolean; readonly label?: Text; readonly selection?: AnalysisSelectionUse }[];
};
/** #911: 조회 입력 / 표시 입력 / 출력 / 데이터 단위 / 쓸 수 있는 조건.
 * Page outputs never write global Context; permissions stay Kernel-owned.
 */
/**
 * The output selection dimension that «조건으로» writes into the global equipment selection (URL `selectedEquipmentIds`; 06 §16,
 * ADR-0059). Declare an equipment set by this name: any other spelling is an ordinary dimension and loses «조건으로» without an error.
 */
export const EQUIPMENT_SELECTION_DIMENSION = 'equipmentId';

export type PanelDeclaration<K extends string = string> = {
  readonly id: string;
  readonly title: Text;
  readonly queryInputs: PanelInputs<K>;
  readonly displayInputs: PanelInputs<K>;
  /** Optional in-memory JSON inputs for lending, independent of page state. */
  readonly display?: readonly { readonly key: string }[];
  readonly outputs: readonly {
    readonly key: K;
    readonly action: string;
    readonly selection?: {
      readonly dimension: string;
      readonly shape: AnalysisSelectionShape;
      /** Display name of the dimension for analysis selection chips. */
      readonly label?: Text;
      /** A single selected value can fill this declared drill level. */
      readonly drillLevel?: string;
      /** Object kind in the assembly's opensObject namespace. */
      readonly objectKind?: string;
    };
  }[];
  readonly grain: string;
  readonly endpoints: readonly (Pick<AnyEndpointSpec, 'id' | 'menuId' | 'permission'>
    & Partial<Pick<AnyEndpointSpec, 'context' | 'requiredContext' | 'requiresScope'>>)[];
  /** Optional legacy gate override: AND groups of OR keys.
   * Derived availability keys never become query/page inputs.
   */
  readonly availability?: {
    readonly requires: readonly { readonly anyOf: readonly string[] }[];
    readonly disabledReason: Text;
  };
  readonly pieces?: readonly string[];
  readonly version?: unknown;
};

/** Where the receiving menu supplies an input to a lent panel. */
export type PanelInputBinding<K extends string = string> =
  | { readonly kind: 'context'; readonly key: PanelContextKey }
  | { readonly kind: 'page'; readonly key: K }
  | { readonly kind: 'value'; readonly key: string };

/** The receiving menu's analysis selection key that a lent panel's output writes (ADR-0176). */
export type PanelOutputBinding<K extends string = string> = { readonly kind: 'page'; readonly key: K };

/** Wiring from the receiving menu to the panel identified by `source`: inputs are read-only; `outputs` lets the
 * source's analysis selection outputs (by source output key) write the receiver's own selection keys only. */
export type PanelBinding<K extends string = string> = {
  readonly source: `${string}/${string}`;
  readonly context?: Readonly<Partial<Record<PanelContextKey, PanelInputBinding<K>>>>;
  readonly page?: Readonly<Record<string, PanelInputBinding<K>>>;
  readonly display?: Readonly<Record<string, Extract<PanelInputBinding<K>, { kind: 'value' }>>>;
  readonly outputs?: Readonly<Record<string, PanelOutputBinding<K>>>;
};

