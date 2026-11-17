import type { ContextKey } from './menu';
import type { AnyEndpointSpec } from './menu-query';
import type { Text } from '../i18n';

export type PanelInputs<K extends string = string> = {
  readonly context?: readonly (ContextKey | 'scopeId')[];
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
  readonly outputs: readonly { readonly key: K; readonly action: string }[];
  readonly grain: string;
  readonly endpoints: readonly Pick<AnyEndpointSpec, 'id' | 'menuId' | 'permission'>[];
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

