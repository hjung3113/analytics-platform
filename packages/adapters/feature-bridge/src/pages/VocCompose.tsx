import { useCallback, useState } from 'react';
import { useI18n, type VocComposeProps } from '@ap/kernel';
import { VocComposeScreen } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '../feature/FeatureBridge';
import { featureQueryClient } from '../feature/session';
import { isUuid } from '../feature/uuid';
import type { DefaultStatus } from '../default-status';

/**
 * The form's initial Managed System (ADR-0070 decision 5): the frozen screen's carried `managedSystem` when it is one UUID (only a carry-set member menu has one, whichever space or global group it is in: operator menus and 내 Task), otherwise the
 * app's `managedSystemFor`. The screen still uses it only when the user's list holds it.
 */
export function initialManagedSystem(context: Pick<VocComposeProps['context'], 'spaceId' | 'carried'>, managedSystemFor: (spaceId: string | null) => string | null): string | null {
  const carried = context.carried.managedSystem;
  if (carried !== undefined && isUuid(carried)) return carried;
  return managedSystemFor(context.spaceId);
}

/** The prefill of a report filed from a screen's error view (#606): the title names the failed menu; the user adds what they did just before. */
const ERROR_REPORT_COPY = {
  ko: { titleSuffix: '오류 신고', body: '화면을 사용하는 중 오류가 발생했습니다.', hint: '오류 직전에 한 작업을 덧붙여 주세요. 화면 정보는 위에 첨부되어 있습니다.' },
  en: { titleSuffix: 'error report', body: 'An error occurred while using this screen.', hint: 'Add what you did just before the error. The screen details are attached above.' },
} as const;

/**
 * The `VOC 등록` form from feature in the rail drawer (ADR-0070 decisions 4–5, ADR-0071). The frozen Context becomes the `화면 정보` block of the
 * description; the screen reads it when the form is submitted, so a chip removed after typing leaves the typed values alone. Without a feature API
 * (mock preview) it shows `실서버 필요` and requests nothing.
 */
export default function VocCompose({ context, onSubmitted, onCancel, onDirtyChange, managedSystemFor, defaultStatus = 'ready' }: VocComposeProps & { managedSystemFor: (spaceId: string | null) => string | null; defaultStatus?: DefaultStatus }) {
  const submitted = useCallback((result: { vocId: string; displayId: string }) => {
    // The new VOC belongs in 내 VOC; a list that is not cached has nothing to refresh.
    void featureQueryClient.invalidateQueries({ queryKey: ['vocs', 'my'] });
    onSubmitted(result);
  }, [onSubmitted]);
  // Whether this draft is an error report is fixed when it starts (a draft is a Compose instance): removing the chips later changes what is sent, not what the form is.
  // The copy is frozen in the language the draft opened in, so a later language switch does not rewrite what the user may have edited.
  const { lang } = useI18n();
  const [report] = useState(() => {
    if (context.traceId === null) return null;
    const copy = ERROR_REPORT_COPY[lang];
    return { title: `${context.items.find(item => item.id === 'error-menu')?.value ?? ''} ${copy.titleSuffix}`.trim(), body: copy.body, hint: copy.hint };
  });
  return <div className="h-full min-h-0">
    <FeatureBridge>
      <VocComposeScreen contextBlock={{ items: context.items.map(({ label, value }) => ({ label, value })), href: context.href }} initialManagedSystemId={initialManagedSystem(context, managedSystemFor)} defaultStatus={defaultStatus}
        {...(report === null ? {} : { errorReport: { title: report.title, body: report.body, hint: report.hint, traceId: context.traceId } })}
        onSubmitted={submitted} onCancel={onCancel} onDirtyChange={onDirtyChange} />
    </FeatureBridge>
  </div>;
}
