import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Check, CircleHelp, Minus, Undo2 } from 'lucide-react';
import { formatText, useI18n, type Text } from '@ap/kernel';
import { Badge, Button, cn } from '@ap/ui';
import { labelOf, type PlatformFeature, type Recipe } from './recipeModel';

export const RECIPE_ITEM: Text = { ko: '이 패널 만든 방법', en: 'How this panel is built' };
const FEATURE_STATES = { on: { ko: '제공', en: 'On' }, off: { ko: '미사용', en: 'Off' }, unknown: { ko: '미확인', en: 'Unknown' } } satisfies Record<PlatformFeature['state'], Text>;
const W = {
  back: { ko: '앞면으로', en: 'Back to the panel' },
  body: { ko: '패널 설명 본문', en: 'Panel recipe content' },
  menuMade: { ko: '메뉴가 선언한 것', en: 'Declared by the menu' }, sdkMade: { ko: '가져다 쓴 SDK 조각', en: 'SDK pieces used' }, platformMade: { ko: '플랫폼이 붙여 준 것', en: 'Added by the platform' },
  data: { ko: '데이터', en: 'Data' }, shape: { ko: '모양', en: 'Shape' }, follows: { ko: '따라갈 맥락', en: 'Follows' }, condition: { ko: '쓸 수 있는 조건', en: 'Available when' },
  code: { ko: '메뉴 코드', en: 'Menu code' }, decl: { ko: '직접 선언 {n}줄(빈 줄 제외·주석 포함, 공유 정의 제외)', en: 'Own declaration {n} lines (blank lines and shared definitions excluded; comments included)' }, file: { ko: '{name} {n}줄', en: '{name} {n} lines' },
  always: { ko: '늘 씀', en: 'Always' }, nowOk: { ko: '지금 쓸 수 있음', en: 'Available now' }, nowNo: { ko: '지금: {reason}', en: 'Now: {reason}' },
  emits: { ko: '내보냄', en: 'Emits' },
  summary: { ko: '직접 선언 {decl}줄(공유 정의 제외) · SDK 조각 {pieces}개 · 플랫폼 기능 {platform}/{total}개 제공', en: 'Own declaration {decl} lines (shared definitions excluded) · {pieces} SDK pieces · {platform} of {total} platform features' },
  counts: { ko: 'SDK 조각은 선언한 종류 수 · 플랫폼 기능은 전체 목록 중 제공(on) 항목 수', en: 'SDK pieces count declared kinds; platform features count on entries in the full list' },
  shared: { ko: '관련 파일 전체(빈 줄 제외·주석 포함, 다른 패널 코드 섞임)', en: 'Whole related files (blank lines excluded, comments included, other panels mixed in)' },
} satisfies Record<string, Text>;

function useWords() {
  const { lang } = useI18n();
  return (text: Text, params?: Record<string, string | number>) => formatText(text, lang, params);
}
const keyList = (keys: readonly string[], w: ReturnType<typeof useWords>) => keys.map(key => w(labelOf(key))).join(' · ');

function Declared({ recipe }: { recipe: Recipe }) {
  const w = useWords();
  const rows: [Text, ReactNode][] = [
    [W.data, <>{w(recipe.data.grain)} <span className="text-text-muted">← {recipe.data.endpoints.join(', ')}</span><br />{keyList(recipe.data.inputs, w)}</>],
    [W.shape, w(recipe.shape)],
    [W.follows, <>{keyList(recipe.follows.inputs, w) || '—'}{recipe.follows.outputs.length > 0 && <><br /><span className="text-text-muted">{w(W.emits)}</span> {recipe.follows.outputs.map(output => `${w(labelOf(output.key))}(${w(output.action)})`).join(' · ')}</>}</>],
    [W.condition, <>{recipe.condition.declared ? w(recipe.condition.declared) : w(W.always)}<br /><span className={recipe.condition.now ? 'text-text-warning-label' : 'text-text-muted'}>{recipe.condition.now ? w(W.nowNo, { reason: w(recipe.condition.now) }) : w(W.nowOk)}</span></>],
  ];
  return <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 break-keep text-sm">
    {rows.map(([label, value]) => <div key={label.ko} className="contents"><dt className="text-text-secondary">{w(label)}</dt><dd className="min-w-0 text-text-primary">{value}</dd></div>)}
  </dl>;
}
function CodeLines({ recipe }: { recipe: Recipe }) {
  const w = useWords();
  return <p className="text-xs text-text-secondary break-keep">
    {w(W.code)}: {w(W.decl, { n: recipe.code.declaration })}{recipe.code.files.map(file => <span key={file.name}> · {w(W.file, { name: file.name, n: file.lines })}</span>)}
    <br /><span className="text-text-muted">{w(W.shared)}</span><br /><span className="text-text-muted">{w(W.counts)}</span>
  </p>;
}
function FeatureMark({ state }: { state: PlatformFeature['state'] }) {
  if (state === 'on') return <Check className="size-3.5 shrink-0 text-accent-success" aria-hidden />;
  if (state === 'off') return <Minus className="size-3.5 shrink-0 text-text-muted" aria-hidden />;
  return <CircleHelp className="size-3.5 shrink-0 text-text-muted" aria-hidden />;
}
function Features({ recipe }: { recipe: Recipe }) {
  const w = useWords();
  return <ul className="grid gap-1 text-sm break-keep">
    {recipe.platform.map(item => <li key={item.id} className={cn('flex items-center gap-1.5', item.state !== 'on' && 'text-text-muted')}>
      <FeatureMark state={item.state} /><span className="sr-only">{w(FEATURE_STATES[item.state])}: </span><span>{w(item.label)}</span>{item.note && <span className="text-xs text-text-muted">· {w(item.note)}</span>}
    </li>)}
  </ul>;
}
const onCount = (recipe: Recipe) => recipe.platform.filter(item => item.state === 'on').length;

/** A stable focus target across the front/back content swap. */
export function RecipePanel({ recipe, onClose, children }: { recipe: Recipe | null; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  useLayoutEffect(() => {
    if (recipe || !returnFocus.current) return;
    returnFocus.current = false;
    const target = root.current;
    if (target && (document.activeElement === document.body || target.contains(document.activeElement))) target.focus({ preventScroll: true });
  }, [recipe]);
  const close = () => {
    returnFocus.current = root.current?.contains(document.activeElement) ?? false;
    onClose();
  };
  return <div ref={root} tabIndex={-1} className="h-full min-h-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
    {recipe ? <RecipeBack recipe={recipe} onClose={close} /> : children}
  </div>;
}

function Summary({ recipe }: { recipe: Recipe }) {
  const w = useWords();
  return <span className="text-xs text-text-secondary break-keep">{w(W.summary, { decl: recipe.code.declaration, pieces: recipe.pieces.length, platform: onCount(recipe), total: recipe.platform.length })}</span>;
}

/** a1 — the panel turns over: three columns, menu → SDK → platform, inside the panel's own frame. */
export function RecipeBack({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const w = useWords();
  return <section aria-label={w(RECIPE_ITEM)} className="flex h-full min-h-0 flex-col bg-surface-card">
    <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-3 py-2">
      <h3 className="text-sm font-medium text-text-primary">{w(RECIPE_ITEM)}</h3>
      <Summary recipe={recipe} />
      <Button type="button" variant="ghost" size="toolbar" className="ml-auto" onClick={onClose}><Undo2 className="size-3.5" aria-hidden />{w(W.back)}</Button>
    </div>
    <div role="region" aria-label={w(W.body)} tabIndex={0} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] divide-x divide-border-subtle overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
      <div className="grid content-start gap-3 p-3">
        <h4 className="text-xs font-medium text-text-secondary">① {w(W.menuMade)}</h4>
        <Declared recipe={recipe} />
        <CodeLines recipe={recipe} />
      </div>
      <div className="grid content-start gap-3 p-3">
        <h4 className="text-xs font-medium text-text-secondary">② {w(W.sdkMade)}</h4>
        <div className="flex flex-wrap gap-1.5">{recipe.pieces.map(piece => <Badge key={piece} variant="outline">{piece}</Badge>)}</div>
      </div>
      <div className="grid content-start gap-3 p-3">
        <h4 className="text-xs font-medium text-text-secondary">③ {w(W.platformMade)}</h4>
        <Features recipe={recipe} />
      </div>
    </div>
  </section>;
}

