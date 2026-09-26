# P1-1 — `returnTo` only to a local registered route

Implementation design. Paste the blocks. Do not invent a second rule.

Review: `prototypes/platform-app/reports/review-grok-kernel.md` **P1-1**. Contract: `docs/06_platform_ui_contract.md` §6.4 paragraph **분석으로 돌아가기** — back navigation restores the entry URL and is not an open redirect.

`linkTo(..., { returnTo: true })` stores the current path+search as an opaque page value. `parseQuery` does not validate page values. `ExecutionDetail` puts that string on `<a href>`. `PlatformLink` only `preventDefault`s a primary unmodified click, then `navigate` → `pushState`. Cmd-click, middle-click, and “Open in new tab” follow `href`. A normal click on `https://…` or `//evil.example` calls `pushState` and throws `SecurityError`. `EquipmentDetail` calls `navigate(pageParam('returnTo'))` with the same unchecked string.

Designs 1 and 2 are landing in `server.ts`, `world.ts`, `TopBar.tsx`, `url.ts` (`incompleteMetricPair`), `registry.ts` (`initializesMetric`), `platform.tsx` (metric init), `App.tsx`, and the cycle-time metric query. Do not edit those behaviors. Anchor every edit by function name, not line number.

## Rules you must not reinterpret

- One helper, `safeReturnTo(value: string | null): string | null`, in `url.ts`. `null` means “do not use this value”.
- `usePlatform().returnTarget(): string` is the only call the two detail pages make. It is `safeReturnTo(pageParam('returnTo')) ?? linkTo(route.menu.parent ?? 'home')`. Both the `href` and the click use that string. Do not read `pageParam('returnTo')` inside `navigate(…)`.
- Accept only a same-origin relative URL that starts with exactly one `/`. Reject a scheme, `//` anywhere (raw or after one `decodeURIComponent`), `\`, a control character (U+0000–U+001F or U+007F), and `#`.
- The path (before `?`) must `matchRoute` to a registered menu that is **not** `navHidden`. Detail routes (`equipment-detail`, `execution-detail`, `metric-detail`) are `navHidden` and are rejected. `/equipment/X` is rejected.
- The query must `parseQuery(search, menu.pageKeys)` without throwing. `v=2` throws `unsupported_version` and is rejected. Do not strip the bad key and keep the rest.
- On success return the **original** string, not a rebuilt query. §6.4 restores the entry URL.
- On failure the page falls back to `linkTo(parent)`. It does not navigate to a cleaned-up attacker URL.
- Do not change `linkTo`’s writing of `returnTo` (it already stores the current in-app URL). Do not change `PlatformLink` modifier-click behavior: a safe `href` is what makes cmd-click / middle-click / new-tab safe.
- `navigate` still carries in-app detail paths (`/equipment/ICH-…`, `/analytics/executions/…`). It must not run the menu allowlist. It must refuse a target that fails the syntactic check, so a forgotten caller cannot `pushState` an off-origin URL.

## Files to change

| File | What |
| --- | --- |
| `prototypes/platform-app/src/kernel/url.ts` | Add `isAppRelativePath` and `safeReturnTo` |
| `prototypes/platform-app/src/kernel/platform.tsx` | `returnTarget` on the platform value; syntactic guard inside `navigate` |
| `prototypes/platform-app/src/pages/analytics/ExecutionDetail.tsx` | Back `href` and caption use `returnTarget` |
| `prototypes/platform-app/src/pages/equipment/EquipmentDetail.tsx` | Back control is a `PlatformLink` whose `href` is `returnTarget()` |
| `prototypes/platform-app/src/kernel/return-to.test.ts` | New file, full contents below |

Do not edit `registry.ts`, `server.ts`, `world.ts`, `TopBar.tsx`, `App.tsx`, `cycleData.ts`, or `CycleTimeDrilldown.tsx`.

## 1. `src/kernel/url.ts`

`url.ts` does not import the registry today. Add:

```ts
import { matchRoute } from './registry';
```

`registry.ts` does not import `url.ts`. Keep it that way.

Append after `incompleteMetricPair` if that function is already in the file; otherwise append after `formatMetricVersion`. Do not change `parseQuery` or `incompleteMetricPair`.

```ts
/** Syntactic same-origin path. Detail routes still pass. Open redirects do not. */
export function isAppRelativePath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('#') || value.includes('\\') || value.includes('//')) return false;
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return false; }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return false;
  if (decoded.includes('#') || decoded.includes('\\') || decoded.includes('//')) return false;
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return false;
  const path = decoded.split('?')[0];
  if (path.includes(':')) return false;
  return true;
}

/**
 * Entry URL for “back”, or null. Registered non-detail menu, query parses for that menu.
 * Returns the original string so the entry URL is not rewritten.
 */
export function safeReturnTo(value: string | null): string | null {
  if (value === null || !isAppRelativePath(value)) return null;
  const q = value.indexOf('?');
  const path = q === -1 ? value : value.slice(0, q);
  const search = q === -1 ? '' : value.slice(q);
  const route = matchRoute(path);
  if (!route || route.menu.navHidden) return null;
  try { parseQuery(search, route.menu.pageKeys); } catch { return null; }
  return value;
}
```

Colon in the **query** (`from=2026-09-25T09:00:00`) is allowed. Colon in the **path** is not (`javascript:` never starts with `/`; `/\evil` fails the backslash check).

## 2. `src/kernel/platform.tsx`

Import `isAppRelativePath` and `safeReturnTo` from `./url` next to the existing `url` imports. Design 2 may already import `incompleteMetricPair` from that module; add the two names to that import, do not remove design 2’s names.

Inside the `navigate` callback, before `history.replaceState` / `pushState`:

```ts
    if (!isAppRelativePath(next)) return;
```

`linkTo`, `setGlobal`, and `setPage` already build `/…` paths, so they still navigate. `https://…` and `//…` return without touching history.

Add to the `Platform` type, next to `linkTo`:

```ts
  returnTarget: () => string;
```

Inside the provider, next to the `linkTo` callback:

```ts
  const returnTarget = useCallback(() => {
    const safe = safeReturnTo(pageParam('returnTo'));
    if (safe) return safe;
    return linkTo(route?.menu.parent ?? 'home');
  }, [pageParam, route, linkTo]);
```

`pageParam` is declared later in the function today. Move is unnecessary if `returnTarget` is created **after** `const pageParam = useCallback(...)`. Put it there, and put `returnTarget` on the `value` object next to `linkTo`. If design 2 added `metricInit` to `value`, leave it.

## 3. `src/pages/analytics/ExecutionDetail.tsx`

In `ExecutionDetail`, design 2 may already have changed the metric query. Touch only the return wiring.

Replace the `returnTo` / `backHref` pair with:

```ts
  const backHref = returnTarget();
  const restored = safeReturnTo(pageParam('returnTo')) !== null;
```

Destructure `returnTarget` from `usePlatform()`. Import `safeReturnTo` from `../../kernel/url` (the file already imports `parseDateTime` from there).

The back control stays:

```tsx
  const back = <Button asChild variant="secondary" size="sm"><PlatformLink href={backHref}>{ko ? '← 사이클타임 분석으로 돌아가기' : '← Back to cycle time'}</PlatformLink></Button>;
```

`PlatformLink` navigates to `href` on a primary click, and the browser follows the same `href` on cmd-click. Both are `backHref`.

In the caption paragraph, the condition that is today `returnTo ? '' : (ko ? ' returnTo가 없어…' : ' returnTo is absent…')` becomes `restored ? '' : …`. An unsafe `returnTo` uses the same sentence as a missing one. Do not echo the rejected string.

## 4. `src/pages/equipment/EquipmentDetail.tsx`

`PlatformLink` is already imported. Destructure `returnTarget` from `usePlatform()`. Drop `navigate` from that destructure if nothing else in the file uses it.

Replace the secondary action button:

```tsx
    secondaryActions={<Button asChild variant="secondary" size="sm"><PlatformLink href={returnTarget()}>{ko ? '이전 화면으로' : 'Back to previous view'}</PlatformLink></Button>}>
```

There is no second click handler. `href` and the click are the same `returnTarget()` value. Parent is `equipment-master` via `route.menu.parent`.

## 5. Tests

Create `prototypes/platform-app/src/kernel/return-to.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAppRelativePath, safeReturnTo } from './url';

const cycle = '/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';

describe('safeReturnTo', () => {
  it('rejects open redirects and non-routes', () => {
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('https://evil.example/phish')).toBeNull();
    expect(safeReturnTo('//evil.example')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
    expect(safeReturnTo('javascript:alert(1)')).toBeNull();
    expect(safeReturnTo('/unregistered')).toBeNull();
    expect(safeReturnTo('/equipment/X')).toBeNull();
    expect(safeReturnTo('/equipment/X?tab=attributes')).toBeNull();
    expect(safeReturnTo('/analytics/cycle-time?v=2&scopeId=ICH')).toBeNull();
    expect(safeReturnTo('/%2F%2Fevil.example')).toBeNull();
    expect(safeReturnTo('/equipment\u0000')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
  });

  it('keeps a registered non-detail URL whose query parses', () => {
    expect(safeReturnTo(cycle)).toBe(cycle);
    expect(safeReturnTo('/equipment?v=1&scopeId=ICH')).toBe('/equipment?v=1&scopeId=ICH');
    expect(safeReturnTo('/')).toBe('/');
  });

  it('does not treat a detail path as an app-relative failure', () => {
    expect(isAppRelativePath('/equipment/X')).toBe(true);
    expect(safeReturnTo('/equipment/X')).toBeNull();
    expect(isAppRelativePath('https://evil.example')).toBe(false);
    expect(isAppRelativePath('//evil.example')).toBe(false);
  });
});
```

The string `'/\\evil.example'` is the required `/\evil.example` case. `v=2` is the invalid-query case. `/equipment/X` is the detail route. `cycle` is the valid cycle-time URL, returned unchanged (the `T09:00:00` colons stay).

## Acceptance

From `prototypes/platform-app`:

```sh
npx tsc --noEmit
npx vitest run src/kernel/return-to.test.ts
npx vitest run
```

All three must pass. Do not delete a case to make a reject into an allow.

Browser: `npm run dev` (`http://127.0.0.1:5173`, or the port Vite prints). Role **공정 엔지니어**. Scenario **정상**.

1. Open `/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00`. Wait until the page shows rows (design 1 may error this URL if the 7-day time-domain guard is active — if it does, use `from=2026-09-25T09:00:00&to=2026-09-26T09:00:00`, which is the 1-day window). Open any **상세** link. On the execution page, the back link’s `href` (inspect the anchor) starts with `/analytics/cycle-time?` and includes `scopeId=ICH`. Click it. The address bar is that cycle-time URL, not the execution path. Selection is not rewritten to the one equipment you opened.
2. Paste `/analytics/executions/ICH-PHOTO-0103?v=1&scopeId=ICH&entityType=job&anchor=2026-09-25T10:00:00&returnTo=https://evil.example/phish`. The back anchor’s `href` is `/analytics/cycle-time` plus the current global query (the parent fallback), **not** `https://evil.example`. The caption says `returnTo` is absent. Primary click does not throw and does not leave the origin. The visible URL never becomes `evil.example`.
3. Same execution path with `returnTo=//evil.example`. Same fallback. Cmd-click or “open in new tab” on Back (or copy the `href`) is an in-app `/analytics/cycle-time…` URL, not protocol-relative.
4. `/equipment/ICH-PHOTO-0103?v=1&scopeId=ICH&returnTo=https://evil.example` — the **이전 화면으로** control is an anchor whose `href` starts with `/equipment?` (equipment master), not `https://`. Click it. The equipment master table renders.
5. `/equipment/ICH-PHOTO-0103?v=1&scopeId=ICH&returnTo=/analytics/cycle-time?v=1%26scopeId=ICH` — `returnTo` was encoded as one query value. After the page parses it, Back’s `href` is `/analytics/cycle-time?v=1&scopeId=ICH`. Click lands on cycle time. (Build this URL carefully: the whole return target is one `returnTo` parameter.)
6. `/equipment/ICH-PHOTO-0103?v=1&scopeId=ICH&returnTo=/analytics/cycle-time?v=2` — `v=2` does not parse, so Back falls back to equipment master, not cycle time and not a rewritten `v=1`.

Desktop width is enough.

## Not in this task

- P0-1 metric-pair initialization and P0-2 time-domain merge, including their tests.
- Changing which URL `linkTo({ returnTo: true })` writes. It stays “current path + search”.
- Blocking modifier-click on `PlatformLink`, or making the drawer modal.
- Rejecting duplicate page keys (review P2-1) inside an otherwise valid `returnTo`.
- A permission check on the target menu. An analyst may return to a registered route; the route gate still applies after navigation.
- Returning to a `navHidden` detail, even a well-formed `/equipment/ICH-PHOTO-0103?tab=attributes`.
- Sanitizing `returnTo` by deleting only the bad parameter and keeping the rest of an attacker URL.
