import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@ap/ui';

/** Fixed-copy screen for a composition root whose assembly rejected or threw. `@ap/ui` only; no error text, URL or stack (#154). */
export function StartupFailure() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Alert variant="destructive">
        <AlertTitle>화면을 시작할 수 없습니다</AlertTitle>
        <AlertDescription>잠시 후 다시 시도해 주세요. 문제가 계속되면 담당자에게 알려 주세요.</AlertDescription>
      </Alert>
      <Button onClick={() => window.location.reload()}>다시 시도</Button>
    </main>
  );
}

/** Runs the async startup; a rejection or throw renders the failure screen instead of leaving a blank root and an unhandled rejection. */
export async function startOrFail(root: { render: (node: ReactNode) => void }, start: () => Promise<void> | void): Promise<void> {
  try {
    await start();
  } catch {
    root.render(<StartupFailure />);
  }
}
