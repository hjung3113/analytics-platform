import { ChevronDown, Link2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { useCopyLink } from '@ap/components';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Popover, PopoverAnchor, PopoverContent, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { buildShareLink, type ShareLinkFailure, type ShareLinkKind } from './shareLink';

const TEXT = {
  ko: {
    group: '링크 복사', conditions: '현재 조건 공유', menu: '메뉴 주소 복사', choose: '링크 복사 방식 선택',
    conditionsHelp: '적용된 조건의 링크를 복사합니다. 편집 중인 변경은 제외합니다.', menuHelp: '조건 없이 메뉴 주소만 복사합니다.',
    conditionsDone: '현재 적용된 조건의 링크를 복사했습니다. 편집 중인 변경은 제외됩니다.', menuDone: '조건 없는 메뉴 주소를 복사했습니다.',
    conditionsFailed: '현재 조건 링크를 복사하지 못했습니다.', menuFailed: '메뉴 주소를 복사하지 못했습니다.',
    tooLong: '조건 링크가 너무 길어 복사하지 못했습니다. 조건을 줄인 뒤 다시 시도하세요.',
    serialize: '조건 링크를 만들지 못했습니다. 적용된 조건을 확인한 뒤 다시 시도하세요.',
    menuUnavailable: '메뉴 주소를 만들지 못했습니다. 화면 주소의 필수 값을 확인한 뒤 다시 시도하세요.',
    field: '복사할 링크', retry: '다시 시도', close: '닫기',
  },
  en: {
    group: 'Copy link', conditions: 'Share current conditions', menu: 'Copy menu address', choose: 'Choose link to copy',
    conditionsHelp: 'Copies a link to the applied conditions. Changes being edited are excluded.', menuHelp: 'Copies the menu address only, without conditions.',
    conditionsDone: 'Copied a link to the currently applied conditions. Changes being edited are excluded.', menuDone: 'Copied the menu address without conditions.',
    conditionsFailed: 'Could not copy the current conditions link.', menuFailed: 'Could not copy the menu address.',
    tooLong: 'The conditions link is too long to copy. Reduce the conditions and try again.',
    serialize: 'Could not build the conditions link. Check the applied conditions and try again.',
    menuUnavailable: 'Could not build the menu address. Check the required values of this screen and try again.',
    field: 'Link to copy', retry: 'Retry', close: 'Close',
  },
} as const;

/**
 * Share split button (kernel.md §11): the main button always copies the link to the APPLIED conditions, the menu adds the
 * menu-only address. Both go through `buildShareLink`; a failed build never reaches the clipboard and never shows a link field.
 * `compact` only drops the icon — the conditions label stays visible (the live bar measures this width), and `align` anchors the menu to the group.
 */
export function ShareControl({ compact = false, align = 'end' }: { compact?: boolean; align?: 'start' | 'end' }) {
  const { route, global, page, absoluteUrl, toast } = useHostPlatform();
  const { lang } = useI18n();
  const text = TEXT[lang];
  const id = useId();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<{ kind: ShareLinkKind; link: string } | null>(null);
  const copyConditions = useCopyLink(text.conditionsDone, { absolute: true, failureText: text.conditionsFailed, onFailure: link => setFallback({ kind: 'conditions', link }) });
  const copyMenu = useCopyLink(text.menuDone, { absolute: true, failureText: text.menuFailed, onFailure: link => setFallback({ kind: 'menu', link }) });
  const failure = (kind: ShareLinkKind, reason: ShareLinkFailure) => reason === 'too-long' ? text.tooLong : kind === 'conditions' ? text.serialize : text.menuUnavailable;

  const origin = useRef<'main' | 'chevron'>('main');
  const mainRef = useRef<HTMLButtonElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const current = fallback ? buildShareLink({ kind: fallback.kind, route, global, page, absoluteUrl }) : null;
  // The field must always equal what Retry copies: once the applied state moves on, the retained link is obsolete and the fallback closes.
  const stale = fallback !== null && !(current?.ok && current.href === fallback.link);
  useEffect(() => { if (stale) setFallback(null); }, [stale]);

  /** `retained` is the link the failure field shows: Retry copies exactly it, never a freshly built one. */
  const share = async (kind: ShareLinkKind, from: 'main' | 'chevron', retained?: string) => {
    if (pending.current) return;
    origin.current = from;
    let href = retained;
    if (href === undefined) {
      const built = buildShareLink({ kind, route, global, page, absoluteUrl });
      if (!built.ok) { setFallback(null); toast(failure(kind, built.reason), 'warning'); return; }
      href = built.href;
    }
    pending.current = true; setBusy(true);
    try {
      setFallback(null);
      await (kind === 'conditions' ? copyConditions : copyMenu)(href);
    } finally { pending.current = false; setBusy(false); }
  };

  const conditionsHelpId = `${id}-conditions-help`;
  const menuHelpId = `${id}-menu-help`;
  return <TooltipProvider>
    <Popover open={fallback !== null && !stale} onOpenChange={open => { if (!open) setFallback(null); }}>
      <PopoverAnchor asChild>
        <span role="group" aria-label={text.group} className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button ref={mainRef} type="button" variant="secondary" size="toolbar" aria-describedby={conditionsHelpId} aria-disabled={busy || undefined} onClick={() => void share('conditions', 'main')}>
                {!compact && <Link2 className="size-3.5" aria-hidden />}{text.conditions}
              </Button>
            </TooltipTrigger>
            <TooltipContent size="sm">{text.conditionsHelp}</TooltipContent>
          </Tooltip>
          <span id={conditionsHelpId} className="sr-only">{text.conditionsHelp}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={chevronRef} type="button" variant="secondary" size="toolbar" aria-label={text.choose} aria-disabled={busy || undefined}><ChevronDown className="size-3.5" aria-hidden /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} collisionPadding={8}>
              <DropdownMenuItem aria-describedby={conditionsHelpId} onSelect={() => void share('conditions', 'chevron')}>
                <span className="grid gap-0.5"><span>{text.conditions}</span><span aria-hidden className="text-xs text-text-secondary">{text.conditionsHelp}</span></span>
              </DropdownMenuItem>
              <DropdownMenuItem aria-describedby={menuHelpId} onSelect={() => void share('menu', 'chevron')}>
                <span className="grid gap-0.5"><span>{text.menu}</span><span id={menuHelpId} aria-hidden className="text-xs text-text-secondary">{text.menuHelp}</span></span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </PopoverAnchor>
      {/* The menu returns focus to the chevron as it closes; that must not dismiss the fallback it just opened. */}
      <PopoverContent align={align} collisionPadding={8} className="w-80" onFocusOutside={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); (origin.current === 'main' ? mainRef : chevronRef).current?.focus(); }} role="dialog" aria-label={fallback?.kind === 'menu' ? text.menuFailed : text.conditionsFailed}>
        <div className="grid gap-2">
        <p className="text-sm">{fallback?.kind === 'menu' ? text.menuFailed : text.conditionsFailed}</p>
        <Input readOnly aria-label={text.field} value={fallback?.link ?? ''} onFocus={event => event.currentTarget.select()} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="toolbar" onClick={() => setFallback(null)}>{text.close}</Button>
          <Button type="button" size="toolbar" onClick={() => fallback && void share(fallback.kind, origin.current, fallback.link)}>{text.retry}</Button>
        </div>
        </div>
      </PopoverContent>
    </Popover>
  </TooltipProvider>;
}
