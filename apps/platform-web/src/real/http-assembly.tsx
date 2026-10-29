import { Alert, AlertDescription, AlertTitle, Button } from '@ap/ui';
import { bootstrapHttpAdapter, type BootstrapResult, type HttpAdapterOptions } from '@ap/http-adapter';
import { FO_API_PREFIX } from '../../scripts/real-dev-proxy.ts';
import type { AssemblyOutcome, CreateAssembly } from '#platform-assembly';
import { afterImport, runLocalImport, type LocalImportDeps } from './local-import';
import { createEndpointInvalidation, withNoticeInvalidation } from './endpoint-invalidation';

/**
 * This repo's real-server assembly (#154, http-adapter-contract §3 안 B): `vite --mode real` aliases `#platform-assembly`
 * here, and an in-house production build may point `AP_PLATFORM_ASSEMBLY` at it too. It imports no mock and nothing
 * from `src/dev/**` (ADR-0009, `check:prod-graph`).
 */

type Where = { pathname: string; search: string };

/** FeedbackOps reads `return_to` raw, so the whole app-relative URL is encoded — an unencoded `&` would cut the Context (#150). */
export const loginHref = (where: Where): string => `/auth/login?return_to=${encodeURIComponent(where.pathname + where.search)}`;

/** No Kernel, no shell, no i18n provider: only `@ap/ui` parts, fixed Korean copy, the correlation id the person can read out. */
function Unavailable({ correlationId }: { correlationId: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Alert variant="destructive">
        <AlertTitle>서버에 연결할 수 없습니다</AlertTitle>
        <AlertDescription>
          문제가 계속되면 아래 번호를 담당자에게 알려 주세요.
          <br />
          <code>{correlationId}</code>
        </AlertDescription>
      </Alert>
      <Button onClick={() => window.location.reload()}>다시 시도</Button>
    </main>
  );
}

type Deps = {
  bootstrap: (options: HttpAdapterOptions) => Promise<BootstrapResult>;
  where: () => Where;
  /** Browser storage and Web Locks of the one-time local saved-view import; default to the page's own. */
  importEnvironment?: () => Pick<LocalImportDeps, 'storage' | 'locks'>;
};

const pageEnvironment = (): Pick<LocalImportDeps, 'storage' | 'locks'> => ({
  storage: window.localStorage,
  locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
});

/**
 * The server saved-view store (ADR-0099) on the adapter's own transport and session. The legacy browser-local rows of the
 * signed-in actor are offered to the server once per assembly; reads wait for that one bounded attempt and never fall back to
 * the browser when it fails.
 */
function serverSavedViews(ready: Extract<BootstrapResult, { kind: 'ready' }>, environment: () => Pick<LocalImportDeps, 'storage' | 'locks'>) {
  const imported = Promise.resolve()
    .then(() => runLocalImport({ ...environment(), actorId: () => ready.adapter.session().user.id, importLocal: ready.importLocal }))
    .catch(() => undefined);
  return afterImport(ready.store, imported);
}

/** `createAssembly` with its two environment reads injected, so the branches are testable without a server. */
export function createRealAssembly({ bootstrap, where, importEnvironment = pageEnvironment }: Deps): () => Promise<AssemblyOutcome> {
  return async () => {
    const login: AssemblyOutcome = { redirect: loginHref(where()) };
    const onSessionLost = () => window.location.replace(loginHref(where()));
    const result = await bootstrap({ onSessionLost });
    if (result.kind === 'ready') {
      // One decorated adapter per bootstrap (never per render): a notice write refreshes the Home banner (#1106).
      const invalidation = createEndpointInvalidation();
      return { adapter: withNoticeInvalidation(result.adapter, invalidation), topBarTools: null, serverPreferences: true, savedViews: serverSavedViews(result, importEnvironment), featureApi: { basePath: FO_API_PREFIX, onSessionLost }, invalidation: { subscribe: invalidation.subscribe } };
    }
    if (result.kind === 'login') return login;
    return { screen: <Unavailable correlationId={result.correlationId} /> };
  };
}

export const createAssembly: CreateAssembly = createRealAssembly({ bootstrap: bootstrapHttpAdapter, where: () => window.location });
