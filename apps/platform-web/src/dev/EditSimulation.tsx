import { useState } from 'react';
import { useI18n, useUnsavedGuard } from '@ap/kernel';
import { Button, Checkbox, Input, Label } from '@ap/ui';

/**
 * Mock-only stand-in for a screen with unsaved edits (#1388 node c). No real screen adopts `useUnsavedGuard` yet,
 * so reviewers and the black-box E2E open this fixture from the demo tools to reach the shell's leave dialog.
 * It registers exactly like a consumer would: dirty registers, clearing the draft or switching it off unregisters.
 * State lives in `DevTools` (always mounted in the rail), so it survives the popover closing and every navigation.
 */
const CUSTOM_MESSAGE = { ko: '스펙 편집기의 변경 3건이 저장되지 않았습니다', en: '3 changes in the spec editor are not saved' };
const copy = {
  title: { ko: '편집 중 시뮬레이션', en: 'Simulate editing' },
  hint: { ko: '켜고 변경 내용을 입력하면 메뉴 이동 확인이 열립니다.', en: 'Turn on and type a change to make menu moves ask first.' },
  draft: { ko: '변경 내용', en: 'Changes' },
  custom: { ko: '사용자 지정 메시지', en: 'Custom message' },
  reset: { ko: '초기화', en: 'Reset' },
};

export function useEditSimulation() {
  const [enabled, setEnabled] = useState(false);
  const [draft, setDraft] = useState('');
  const [custom, setCustom] = useState(false);
  useUnsavedGuard(enabled && draft !== '', { message: custom ? CUSTOM_MESSAGE : undefined, onDiscard: () => setDraft('') });
  return { enabled, setEnabled, draft, setDraft, custom, setCustom };
}

export function EditSimulationSection({ sim }: { sim: ReturnType<typeof useEditSimulation> }) {
  const { tx } = useI18n();
  return <section aria-label={tx(copy.title)} data-testid="edit-simulation" className="mt-3 border-t border-border-subtle pt-3">
    <div className="flex items-center gap-2">
      <Checkbox id="edit-sim-enabled" checked={sim.enabled} onCheckedChange={next => sim.setEnabled(next === true)} />
      <Label htmlFor="edit-sim-enabled">{tx(copy.title)}</Label>
    </div>
    <p className="mb-2 mt-1 text-tiny text-text-secondary">{tx(copy.hint)}</p>
    {sim.enabled && <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor="edit-sim-draft">{tx(copy.draft)}</Label>
        <Input id="edit-sim-draft" data-testid="edit-simulation-draft" value={sim.draft} onChange={event => sim.setDraft(event.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="edit-sim-custom" checked={sim.custom} onCheckedChange={next => sim.setCustom(next === true)} />
        <Label htmlFor="edit-sim-custom">{tx(copy.custom)}</Label>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => sim.setDraft('')}>{tx(copy.reset)}</Button>
    </div>}
  </section>;
}
