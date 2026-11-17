import type { MenuMeta, Text } from '@ap/contracts';
import { CONTEXT_LABELS, disabledReason, type RegisteredPanel } from '@ap/kernel';

/** Panel item label that turns a panel over to its recipe. */
export const PANEL_RECIPE_ITEM: Text = { ko: '이 패널 만든 방법', en: 'How this panel is built' };

export type PanelRecipeFeatureState = 'on' | 'off' | 'unknown';
export type PanelRecipeFeature = { readonly id: string; readonly label: Text; readonly state: PanelRecipeFeatureState; readonly note?: Text };
export type PanelRecipeKey = { readonly key: string; readonly label: Text };

/** What the hosting workspace gives this panel. The workspace knows these; the declaration does not. */
export type PanelRecipeHost = {
  readonly add: boolean;
  readonly pin: boolean;
  readonly hide: boolean;
  /** The workspace keeps its layout (`PanelWorkspace` `persistKey`). */
  readonly layout: boolean;
  readonly maximize: boolean;
  /** The panel offers zoom and range selection. */
  readonly range: boolean;
  /** The panel offers image export. Off shows that the SDK option exists but this menu did not turn it on. */
  readonly image?: boolean;
  /** The panel offers its own CSV besides a chart's (a table export). Needs `features.export`. */
  readonly csv?: boolean;
};

/** Code counts the menu measured: non-blank lines, comments included. */
export type PanelRecipeCode = { readonly declaration: number; readonly files: readonly { readonly name: string; readonly lines: number }[] };

export type PanelRecipeInput = {
  readonly panel: RegisteredPanel;
  readonly menu: { readonly features: MenuMeta['features'] };
  readonly context: Readonly<Record<string, unknown>>;
  readonly host: PanelRecipeHost;
  /** Words for the menu's own keys, grains and output actions; a missing entry shows its id. Context keys use the Kernel's names. */
  readonly labels?: { readonly keys?: Readonly<Record<string, Text>>; readonly grains?: Readonly<Record<string, Text>>; readonly actions?: Readonly<Record<string, Text>> };
  /** What the panel draws, as a reader names it. */
  readonly shape?: Text;
  readonly code?: PanelRecipeCode;
};

export type PanelRecipe = {
  readonly panel: RegisteredPanel;
  readonly shape: Text;
  readonly data: { readonly endpoints: readonly string[]; readonly grain: Text; readonly inputs: readonly PanelRecipeKey[] };
  readonly pieces: readonly string[];
  readonly follows: { readonly inputs: readonly PanelRecipeKey[]; readonly outputs: readonly (PanelRecipeKey & { readonly action: Text })[] };
  readonly condition: { readonly declared: Text | null; readonly now: Text | undefined };
  readonly code?: PanelRecipeCode;
  readonly platform: readonly PanelRecipeFeature[];
};

const same = (id: string): Text => ({ ko: id, en: id });
/** Own entries only: a declared id such as `constructor` must never pick up an inherited property. */
const own = (words: Readonly<Record<string, Text>> | undefined, id: string): Text | undefined => words && Object.hasOwn(words, id) ? words[id] : undefined;
const CHART_PIECES = (piece: string) => piece === 'AnalysisChart' || piece.startsWith('AnalysisChart:') || piece === 'AnalysisChartFrame';
const F = {
  add: { ko: '패널 추가', en: 'Add panel' }, pin: { ko: '고정', en: 'Pin' }, hide: { ko: '숨기기', en: 'Hide' }, layout: { ko: '배치 저장', en: 'Saved layout' },
  maximize: { ko: '크게 보기', en: 'Maximize' }, range: { ko: '확대·구간', en: 'Zoom & range' }, annotate: { ko: '주석', en: 'Annotate' }, image: { ko: '이미지', en: 'Image' },
  csv: { ko: 'CSV', en: 'CSV' }, states: { ko: '빈·오류 상태', en: 'Empty & error states' }, link: { ko: '공유 링크', en: 'Share link' }, permission: { ko: '권한', en: 'Permission' }, audit: { ko: '감사', en: 'Audit' },
  menuOff: { ko: '메뉴가 끔', en: 'Off in this menu' },
  optionOff: { ko: '메뉴가 안 켬(SDK 옵션 있음)', en: 'Not turned on by this menu (SDK option exists)' },
  auditNote: { ko: '공통 경로, 이 패널 기록은 확인 안 함', en: 'Shared path, not checked per panel' },
} satisfies Record<string, Text>;

/**
 * How a registered panel is built: what the menu declared, which SDK pieces it uses and which platform
 * functions it gets. Reads only the Registry panel, the menu's feature switches and the host's facts.
 */
export function panelRecipe({ panel, menu, context, host, labels = {}, shape, code }: PanelRecipeInput): PanelRecipe {
  const keys = labels.keys ?? {};
  const key = (id: string): PanelRecipeKey => ({ key: id, label: own(CONTEXT_LABELS, id) ?? own(keys, id) ?? same(id) });
  const pieces = panel.pieces ?? [];
  const chart = pieces.some(CHART_PIECES);
  const required = (panel.queryInputs.page ?? []).filter(input => input.required).map(input => key(input.key).label);
  const declared = panel.availability?.disabledReason
    ?? (required.length ? { ko: `${required.map(label => label.ko).join(', ')} 필요`, en: `Needs ${required.map(label => label.en).join(', ')}` } : null);
  const on = (value: boolean) => value ? 'on' as const : 'off' as const;
  const permissions = panel.permissions.map(String).join(', ');
  return {
    panel,
    shape: shape ?? same('—'),
    data: { endpoints: panel.endpoints.map(endpoint => endpoint.id), grain: own(labels.grains, panel.grain) ?? same(panel.grain), inputs: [...(panel.queryInputs.context ?? []), ...(panel.queryInputs.page ?? []).map(input => input.key)].map(key) },
    pieces,
    follows: {
      inputs: (panel.displayInputs.page ?? []).map(input => key(input.key)),
      outputs: panel.outputs.map(output => ({ ...key(output.key), action: own(labels.actions, output.action) ?? same(output.action) })),
    },
    condition: { declared, now: disabledReason(panel, context, keys) },
    ...(code ? { code } : {}),
    platform: [
      { id: 'add', label: F.add, state: on(host.add) },
      { id: 'pin', label: F.pin, state: on(host.pin) },
      { id: 'hide', label: F.hide, state: on(host.hide) },
      { id: 'layout', label: F.layout, state: on(host.layout) },
      { id: 'maximize', label: F.maximize, state: on(host.maximize) },
      { id: 'range', label: F.range, state: on(host.range) },
      { id: 'annotate', label: F.annotate, state: on(chart && menu.features.annotate === true), ...(chart && menu.features.annotate !== true ? { note: F.menuOff } : {}) },
      { id: 'image', label: F.image, state: on(host.image === true), ...(host.image === true ? {} : { note: F.optionOff }) },
      { id: 'csv', label: F.csv, state: on(menu.features.export === true && (chart || host.csv === true)) },
      { id: 'states', label: F.states, state: on(pieces.includes('QueryView')) },
      // Every panel lives on a menu address, so the Kernel URL contract always carries it.
      { id: 'link', label: F.link, state: 'on' },
      // Registration derives every grant the panel needs; an empty list never registers.
      { id: 'permission', label: F.permission, state: on(panel.permissions.length > 0), note: same(permissions) },
      { id: 'audit', label: F.audit, state: 'unknown', note: F.auditNote },
    ],
  };
}
