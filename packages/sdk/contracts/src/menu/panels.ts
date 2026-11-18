import type { ContextKey } from './menu';
import type { AnyEndpointSpec } from './menu-query';
import type { Text } from '../i18n';

export type PanelContextKey = ContextKey | 'scopeId';

export type PanelInputs<K extends string = string> = {
  readonly context?: readonly PanelContextKey[];
  readonly page?: readonly { readonly key: K; readonly required?: boolean }[];
};
/** #911: 조회 입력 / 표시 입력 / 출력 / 데이터 단위 / 쓸 수 있는 조건.
 * Page outputs never write global Context; permissions stay Kernel-owned.
 */
export type PanelDeclaration<K extends string = string> = {
  readonly id: string;
  readonly title: Text;
  readonly queryInputs: PanelInputs<K>;
  readonly displayInputs: PanelInputs<K>;
  /** Optional in-memory JSON inputs for lending, independent of page state. */
  readonly display?: readonly { readonly key: string }[];
  readonly outputs: readonly { readonly key: K; readonly action: string }[];
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

/** Read-only wiring from the receiving menu to the panel identified by `source`. */
export type PanelBinding<K extends string = string> = {
  readonly source: `${string}/${string}`;
  readonly context?: Readonly<Partial<Record<PanelContextKey, PanelInputBinding<K>>>>;
  readonly page?: Readonly<Record<string, PanelInputBinding<K>>>;
  readonly display?: Readonly<Record<string, Extract<PanelInputBinding<K>, { kind: 'value' }>>>;
};

