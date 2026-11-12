import type { CreateHostAssembly, HostAssemblyOutcome } from '@ap/app-host';
import { type HttpAdapterOptions, bootstrapHttpAdapter } from '@ap/http-adapter';
import { Alert, AlertDescription, AlertTitle, Button } from '@ap/ui';

type Where = { pathname: string; search: string };
type Options = Omit<HttpAdapterOptions, 'onSessionLost'> & { where?: () => Where };

const loginHref = (where: Where): string => `/auth/login?return_to=${encodeURIComponent(where.pathname + where.search)}`;

/** Bootstrap failures render without a Kernel or shell provider. Copy follows the public real assembly. */
function BootstrapFailure({
  correlationId,
  throttled = false,
  retryAfterSeconds,
}: { correlationId: string; throttled?: boolean; retryAfterSeconds?: number }) {
  const wait =
    retryAfterSeconds === undefined || retryAfterSeconds <= 0
      ? undefined
      : retryAfterSeconds < 60
        ? `${retryAfterSeconds}초`
        : `${Math.ceil(retryAfterSeconds / 60)}분`;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Alert variant="destructive">
        <AlertTitle>{throttled ? '요청이 너무 많습니다' : '서버에 연결할 수 없습니다'}</AlertTitle>
        <AlertDescription>
          {throttled ? (
            <>
              <span>{wait === undefined ? '잠시 후 다시 시도해 주세요.' : `${wait} 후 다시 시도해 주세요.`}</span>
              <br />
            </>
          ) : null}
          문제가 계속되면 아래 번호를 담당자에게 알려 주세요.
          <br />
          <code>{correlationId}</code>
        </AlertDescription>
      </Alert>
      <Button onClick={() => window.location.reload()}>다시 시도</Button>
    </main>
  );
}

/** The kit has no legacy local saved views to import; it uses the bootstrap's server store directly. */
export function createRealAssembly({ where = () => window.location, ...options }: Options = {}): () => Promise<HostAssemblyOutcome> {
  return async () => {
    const result = await bootstrapHttpAdapter({ ...options, onSessionLost: () => window.location.replace(loginHref(where())) });
    if (result.kind === 'ready') return { adapter: result.adapter, topBarTools: null, serverPreferences: true, savedViews: result.store };
    if (result.kind === 'login') return { redirect: loginHref(where()) };
    return {
      screen: (
        <BootstrapFailure
          correlationId={result.correlationId}
          throttled={result.kind === 'throttled'}
          retryAfterSeconds={result.kind === 'throttled' ? result.retryAfterSeconds : undefined}
        />
      ),
    };
  };
}

export const createAssembly: CreateHostAssembly = createRealAssembly();
