# Table, scope, and URL/serve fixes

Implementation design for review `prototypes/platform-app/reports/review-grok-kernel.md` **P1-2, P1-3, P1-4, P2-1, P2-2, P2-5**. Paste the blocks. Do not touch the time-domain guard, metric-pair gate, `returnTo` / `safeReturnTo`, or the job generator.

Anchor by function name. Designs 1–4 own `evaluateTimeDomainMerge`, `incompleteMetricPair`, `classifyMetricInit`, `returnTarget`, and `src/mock/jobs.ts`.

## Files to change

| File | What |
| --- | --- |
| `src/kernel/i18n.tsx` | `scopeUnknown`, `scopeUnknownTitle`, `scopeUnknownBody` |
| `src/platform/PlatformPage.tsx` | `unknown_scope` gate, not `stateForbidden` |
| `src/shell/TopBar.tsx` | Pill label for `unknown_scope` |
| `src/platform/PlatformDataTable.tsx` | Status line uses the page of the rows on screen; non-abort `loadPage` rejection becomes `outcome: 'error'` |
| `src/kernel/url.ts` | `duplicate_page_key` inside `parseQuery` |
| `src/kernel/url.test.ts` | One new `it` |
| `src/mock/server.ts` | Explicit empty `selection` / `roomNames` → `outcome: 'empty'` |
| `src/mock/explicit-empty.test.ts` | **New.** Full file below |
| `src/kernel/platform.tsx` | `resetContext` keeps `extras`; initial `scope` is `validating` when the URL already has `scopeId` |

## 1. Unknown scope is not “no access” (P1-2)

`checkScope` already returns `unknown_scope` for a missing or unknown id, and `forbidden` only when the site exists and the role has no grant. The UI collapses both into `scopeForbidden` / `stateForbidden`.

In `i18n.tsx`, next to `scopeForbidden`, add:

```ts
  scopeUnknown: { ko: '알 수 없는 Scope', en: 'Unknown scope' },
  scopeUnknownTitle: { ko: '등록되지 않은 Scope입니다', en: 'This scope is not registered' },
  scopeUnknownBody: { ko: '이 scopeId는 권한 거부가 아닙니다. 서버가 Scope를 확인하지 못했으며 다른 Scope로 바꾸지 않습니다.', en: 'This is not a permission denial. The server does not recognize this scopeId, and no other scope is substituted.' },
```

Do not change `stateForbidden` or `scopeForbidden`. Those stay the grant-failure copy.

In `PlatformPage`, the `gate` chain is `validating`, then `none`, then everything else. Split the last arm:

```tsx
        : scope.status === 'unknown_scope'
          ? <StateMessage icon={<MapPinOff className="size-4" aria-hidden />} title={t('scopeUnknownTitle')}
              body={<>{t('scopeUnknownBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>} />
          : <StateMessage tone="warning" icon={<MapPinOff className="size-4" aria-hidden />} title={t('stateForbidden')}
              body={<>{t('stateForbiddenBody')} <span className="t-mono">scopeId={scope.scopeId}</span></>} />;
```

`unknown_scope` uses the default neutral tone, not `tone="warning"`. No “apply recent scope” button on that gate.

In `TopBar`, the status span that currently ends with `t('scopeForbidden')` for every non-valid, non-validating, non-none status becomes:

```tsx
{scope.status !== 'none' && <span className="text-[11px] font-normal opacity-80">· {scope.status === 'valid' ? t('scopeValid') : scope.status === 'validating' ? t('scopeValidating') : scope.status === 'unknown_scope' ? t('scopeUnknown') : t('scopeForbidden')}</span>}
```

Leave the warn color and `ShieldAlert` icon as they are. Only the words change. `XIA` for `engineer` still says **접근 불가** / **No access**. `NOT_A_SITE` says **알 수 없는 Scope** / **Unknown scope**.

## 2. Table status line matches the rows on screen (P1-3)

Inside `PlatformDataTable`, `requestIdentity` is `JSON.stringify([contextIdentity, effectivePage, sorting, retry])`. The page number stored at index 1 is the page those rows were fetched for. `effectivePage` updates immediately; the rows do not.

After `const shown = …`, derive the page the visible rows belong to:

```ts
  const shownPage = shown
    ? (JSON.parse(result!.identity) as [string, number])[1]
    : effectivePage;
```

The status line (the `aria-live="polite"` span that interpolates `effectivePage + 1`) uses `shownPage`, not `effectivePage`. `pageCount` stays based on `data.total` from `shown`. While `loading && shown`, the line still shows the previous page’s rows and that previous page index, plus the existing `t('refreshing')` spinner. It must not say “page 2” over page-1 rows, and it must not say “page 1” over page-2 rows when a header sort resets `page` to 0.

`aria-rowindex={effectivePage * pageSize + item.index + 2}` uses `shownPage` for the same reason. Previous / Next buttons keep using `effectivePage` (that is the request the user made).

## 3. `loadPage` rejection becomes an error outcome (P1-4)

In the `useEffect` that calls `loadRef.current`, replace the `.catch(() => { /* aborted */ })` with the same split as `usePlatformQuery`:

```ts
      .catch(error => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        setResult({
          identity: requestIdentity,
          response: {
            outcome: 'error', data: null, assessments: [], trust: null,
            correlationId: 'client-' + Date.now().toString(16), message: String(error),
          },
        });
      });
```

An abort still leaves `result` alone. Any other throw sets `result.identity` to `requestIdentity`, so `loading` becomes false and the existing `shown.outcome !== 'ok'` branch renders `OutcomeView` with that correlation id. The skeleton must not spin forever.

## 4. Duplicate registered page key (P2-1)

In `parseQuery`, the return builds `page` by filtering `all` with `pageKeys`. Before that return, reject a repeated key that is in `pageKeys`. Unregistered extras may repeat. Global singletons stay on `duplicate_singleton`. Do not change `incompleteMetricPair` or `safeReturnTo`.

```ts
  const page = all.filter(([k]) => pageSet.has(k));
  const seenPage = new Set<string>();
  for (const [key] of page) {
    if (seenPage.has(key)) fail('duplicate_page_key', `${key} appears more than once`);
    seenPage.add(key);
  }
  return {
    global,
    page,
    extras: all.filter(([k]) => !GLOBAL_KEYS.has(k) && !pageSet.has(k)),
  };
```

In `url.test.ts`, inside the existing URL-contract `describe`, add:

```ts
  it('rejects a repeated registered page key and still keeps repeated extras', () => {
    expect(code(() => parseQuery('?granularity=hour&granularity=day', ['granularity']))).toBe('duplicate_page_key');
    expect(code(() => parseQuery('?granularity=hour&granularity=hour', ['granularity']))).toBe('duplicate_page_key');
    expect(parseQuery('?granularity=week', ['granularity']).page).toEqual([['granularity', 'week']]);
    expect(parseQuery('?utm=a&utm=b', ['granularity']).extras).toEqual([['utm', 'a'], ['utm', 'b']]);
  });
```

`code` is already defined in that file. A duplicate that is not in `pageKeys` stays an extra and does not throw.

## 5. Explicit empty set is `outcome: 'empty'` (P2-2)

In `serve`, immediately after the `too_large` return and **before** the `verifiedDomain` / `evaluateTimeDomainMerge` block:

```ts
  if (o.global.selection?.length === 0 || o.global.roomNames?.length === 0) {
    return { ...base, outcome: 'empty' };
  }
```

`null` means the set is absent, not empty. `?.length === 0` is false for `null`. Do not write `!o.global.selection?.length`.

Do not call `compute`. Do not read `isEmpty`. `data` stays null, `assessments` stays `[]`, `trust` stays null. Timeout, scenario `error`, partial failure, `forbidden`, and `too_large` still return earlier, so they win. Do not change the `too_large` predicate and do not change `evaluateTimeDomainMerge`.

An explicit empty selection resolves to zero equipment, so this return also stops a later time-domain merge. That is correct: there is nothing to merge.

Caller `isEmpty` still applies when both sets are absent or non-empty.

Create `src/mock/explicit-empty.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '../kernel/url';
import { serve } from './server';

const period = { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };

describe('explicit empty sets', () => {
  it('returns empty for selection [] and roomNames [] without calling compute or isEmpty', async () => {
    for (const patch of [{ selection: [] as string[] }, { roomNames: [] as string[] }]) {
      const res = await serve({
        role: 'engineer',
        global: { ...emptyGlobal, scopeId: 'ICH', ...period, ...patch },
        latency: 0,
        isEmpty: () => false,
        compute: () => { throw new Error('must not run'); },
      });
      expect(res.outcome).toBe('empty');
      expect(res.data).toBeNull();
      expect(res.assessments).toEqual([]);
      expect(res.trust).toBeNull();
      expect(res.correlationId).toMatch(/^corr-/);
    }
  });

  it('does not treat an absent set as empty, and forbidden still wins', async () => {
    const ok = await serve({
      role: 'engineer',
      global: { ...emptyGlobal, scopeId: 'ICH', ...period },
      latency: 0,
      mergeTimeDomain: false,
      compute: () => 1,
    });
    expect(ok.outcome).toBe('ok');
    expect(ok.data).toBe(1);
    const denied = await serve({
      role: 'engineer',
      global: { ...emptyGlobal, scopeId: 'XIA', ...period, selection: [] },
      latency: 0,
      compute: () => { throw new Error('must not run'); },
    });
    expect(denied.outcome).toBe('forbidden');
  });
});
```

`mergeTimeDomain: false` on the positive control avoids the time-domain guard on a normal multi-equipment day. The empty cases return before that guard, so they do not need the flag.

## 6. Reset keeps extras; first scope paint is `validating` (P2-5)

`resetContext` currently calls `buildQuery({ ...emptyGlobal, scopeId: global.scopeId }, page)` and drops the third argument. `buildQuery` already accepts `extras`. Change that callback to pass them, and add `extras` to the dependency list:

```ts
  const resetContext = useCallback(
    () => navigate(pathname + buildQuery({ ...emptyGlobal, scopeId: global.scopeId }, page, extras)),
    [pathname, navigate, global.scopeId, page, extras],
  );
```

Page keys stay. `scopeId` stays. Analysis fields clear. `utm` stays. Do not change `setGlobal` or `linkTo`.

Replace the `useState` that initializes `scope` to `{ status: 'none' }` with:

```ts
  const [scope, setScope] = useState<ScopeState>(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('scopeId');
      if (id) return { scopeId: id, status: 'validating', grantedRooms: [] };
    } catch { /* keep none */ }
    return { scopeId: null, status: 'none', grantedRooms: [] };
  });
```

Do not parse the rest of the query and do not copy `lastScope` into the URL. The existing scope `useEffect` still revalidates. The first paint of a deep link must not be `none`, so `PlatformPage` must not flash **Scope를 선택하세요** or **최근 Scope 적용**.

## Acceptance

From `prototypes/platform-app`:

```sh
npx tsc --noEmit
npx vitest run src/kernel/url.test.ts src/mock/explicit-empty.test.ts
npx vitest run
```

All three must pass.

Browser: `npm run dev` (`http://127.0.0.1:5173`, or the port Vite prints). Role **공정 엔지니어**. Scenario **정상**, then **느린 응답** for the table check.

1. `/equipment?v=1&scopeId=NOT_A_SITE` — gate title **등록되지 않은 Scope입니다**, body says it is not a permission denial, `scopeId=NOT_A_SITE` is visible. The top-bar pill says **알 수 없는 Scope**, not **접근 불가**. The equipment table is absent.
2. `/equipment?v=1&scopeId=XIA` — gate title **이 Scope에 접근 권한이 없습니다**. Pill says **접근 불가**.
3. `/equipment?v=1&scopeId=ICH` — the first paint is **검증 중…** or the table, never **Scope를 선택하세요** and never **최근 Scope 적용**, before the table appears.
4. `/equipment?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&utm=keep` — click **초기화** in the context bar (it calls `resetContext`). The address bar still contains `utm=keep` and `scopeId=ICH`. `from` and `to` are gone. Equipment time is reference, so they are not written back.
5. `/analytics/productivity?v=1&scopeId=ICH&granularity=hour&granularity=day` — **URL 계약 오류: duplicate_page_key**. The productivity page does not render.
6. Equipment master with scenario **느린 응답**. Go to page 2. While the spinner says **같은 조건으로 갱신 중**, the status line still says page **1** and the rows are still page 1. When the spinner clears, both say page 2. Sort a column from page 2: the line does not claim page 1 until those new rows are actually shown.
7. `/equipment?v=1&scopeId=ICH&equipmentSelection=none` — the table shows **조건에 맞는 결과가 없습니다**, not an empty success grid. This is the explicit-empty server outcome (the page’s own `isEmpty` may also be set; the server test is what proves `isEmpty: () => false` still returns `empty`).

Desktop width is enough.

## Not in this task

- P1-5 radio arrow keys and P1-6 drawer `inert` / Escape.
- P2-3 menu permission inside `serve`, and P2-4 authoring Lot / PPID / Recipe / metric from the context bar.
- Time-domain merge, metric-pair initialization, `returnTo`, and the shared job population.
- Changing the `too_large` rule so an explicit empty selection becomes `too_large`.
- Treating `lotIds: []` or `recipeIds: []` as explicit empty. Only `selection` and `roomNames`.
- Rewriting duplicate extras, or rejecting a repeated page key that the route did not register.
