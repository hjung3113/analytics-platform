// THROWAWAY #55: same observed outcome/message only; never infer collection causes.
import { type ReactNode } from 'react';
import { Clock, Inbox, RotateCw, ServerCrash } from 'lucide-react';
import type { ApiResponse } from '@ap/contracts';
import { useI18n } from '@ap/kernel';
import { Button, cn, usePrototype } from '@ap/ui';
import { WidgetStateContext } from './WidgetStateContext';
type Widget = { response: ApiResponse<unknown> | null | undefined; retry: () => void };
export function PrototypeWidgetStates({ widgets, children }: { widgets: Widget[]; children: ReactNode }) {
  const { states } = usePrototype();
  const { t, lang } = useI18n();
  const groups = new Map<string, Widget[]>();
  for (const widget of widgets) {
    const r = widget.response;
    if (!r || !['error', 'timeout', 'empty'].includes(r.outcome)) continue;
    // Keep confirmed empty explanations distinct; correlation IDs stay with each widget.
    const key = JSON.stringify([r.outcome, r.message ?? '', r.assessments.filter(a => a.explainsEmpty && a.state === 'confirmed')]);
    groups.set(key, [...(groups.get(key) ?? []), widget]);
  }
  const shared = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  const outcome = shared?.[0].response?.outcome;
  const danger = outcome === 'error' || outcome === 'timeout';
  const title = outcome === 'error' ? t('stateError') : outcome === 'timeout' ? t('stateTimeout') : t('stateEmpty');
  const stateLabel = outcome === 'error' ? (lang === 'ko' ? '서버 오류' : 'server error') : outcome === 'timeout' ? (lang === 'ko' ? '시간 초과' : 'timeout') : (lang === 'ko' ? '0건' : 'zero rows');
  const Icon = outcome === 'error' ? ServerCrash : outcome === 'timeout' ? Clock : Inbox;
  return <>{states !== 'A' && shared && shared.length > 1 && <section role={danger ? 'alert' : 'status'} aria-label={lang === 'ko' ? '위젯 상태 요약' : 'Widget state summary'} className={cn('mb-3 rounded-md border p-3 text-xs text-text-secondary', danger ? 'border-text-danger-label bg-accent-danger-soft' : 'border-border-control bg-surface-sunken')}>
    {/* Callout anatomy: semantic icon/title, summary, one page action; no representative widget ID. */}
    <div className={cn('mb-1.5 flex items-center gap-2 text-sm font-semibold', danger ? 'text-text-danger-label' : 'text-text-secondary')}><Icon aria-hidden className="size-4 shrink-0" />{title}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="min-w-0 flex-[1_1_18rem]">{lang === 'ko' ? `위젯 ${shared.length}개에서 같은 응답 상태(${stateLabel})가 확인되었습니다.` : `${shared.length} widgets report the same response state (${stateLabel}).`}</p>
      <Button type="button" size="sm" variant="secondary" onClick={() => shared.forEach(widget => widget.retry())}><RotateCw aria-hidden className="size-3.5" />{t('retry')}</Button>
    </div>
  </section>}<WidgetStateContext.Provider value={states}>{children}</WidgetStateContext.Provider></>;
}
