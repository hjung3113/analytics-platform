import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import type { BootstrapResult, HttpAdapterOptions } from '@ap/http-adapter';
import { createRealAssembly, loginHref } from './http-assembly';

const where = { pathname: '/analytics/cycle-time', search: '?v=1&scopeId=MEM&from=2026-09-25T09:00:00' };
const adapter = { session: () => null } as unknown as PlatformAdapter;

function assemblyFor(result: BootstrapResult) {
  const seen: HttpAdapterOptions[] = [];
  const create = createRealAssembly({ bootstrap: async options => { seen.push(options); return result; }, where: () => where });
  return { create, seen };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('real assembly (#154)', () => {
  it('ready → the adapter and FeedbackOps API with no mock SavedViewStore or top-bar tools (ADR-0071)', async () => {
    const outcome = await assemblyFor({ kind: 'ready', adapter }).create();
    expect(outcome).toEqual({ adapter, topBarTools: null, feedbackOpsApi: { basePath: '/api/fo', onSessionLost: expect.any(Function) } });
    expect(outcome).not.toHaveProperty('savedViews');
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    (outcome as { feedbackOpsApi: { onSessionLost: () => void } }).feedbackOpsApi.onSessionLost();
    expect(replace).toHaveBeenCalledWith(loginHref(where));
  });

  it('login → redirect to /auth/login with return_to fully encoded (an unencoded & would cut the Context)', async () => {
    const outcome = await assemblyFor({ kind: 'login' }).create();
    expect(outcome).toEqual({ redirect: '/auth/login?return_to=%2Fanalytics%2Fcycle-time%3Fv%3D1%26scopeId%3DMEM%26from%3D2026-09-25T09%3A00%3A00' });
    const href = (outcome as { redirect: string }).redirect;
    expect(new URL(href, 'http://x').searchParams.get('return_to')).toBe(where.pathname + where.search);
  });

  it('unavailable → a static screen with the message, the correlation id and a retry button', async () => {
    const outcome = await assemblyFor({ kind: 'unavailable', correlationId: 'req-abc' }).create();
    expect('screen' in outcome).toBe(true);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render((outcome as { screen: React.ReactNode }).screen);
    expect(screen.getByText('서버에 연결할 수 없습니다')).toBeInTheDocument();
    expect(screen.getByText('req-abc')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('onSessionLost → the same login redirect', async () => {
    const { create, seen } = assemblyFor({ kind: 'ready', adapter });
    await create();
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    seen[0]!.onSessionLost!();
    expect(replace).toHaveBeenCalledWith(loginHref(where));
  });
});
