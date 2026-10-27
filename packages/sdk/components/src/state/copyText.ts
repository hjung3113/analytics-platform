import { useI18n, usePlatform } from '@ap/kernel';
import { copyText } from '@ap/ui';

// The plain-text copy and its one success rule live in @ap/ui (06 §15, #673); re-exported so the components API keeps `copyText`.
export { copyText };

export type CopyLinkOptions = {
  /** The url handed to the copier is already absolute (built through `absoluteUrl`), so it is not resolved a second time. */
  absolute?: boolean;
  /** Replaces the generic failure advice (which tells the user to copy the address bar) with an intent-specific sentence. */
  failureText?: string;
  /** Called after a refused write with the exact absolute link that was generated, so the caller can offer it for manual copy and retry. */
  onFailure?: (link: string) => void;
};

/**
 * Link-copy click handler (#300): copies the deployment-aware absolute URL and toasts the caller's success text only after the
 * write actually completed; a refusal or unsupported environment gets a `warning` naming cause and action
 * (06 §26). Consumers stay free of success/failure judgement — this hook owns it. The returned promise resolves
 * `true` once the write completed, so a caller can hold duplicate activation while it is pending.
 */
export function useCopyLink(successText: string, options: CopyLinkOptions = {}): (url: string) => Promise<boolean> {
  const { toast, absoluteUrl } = usePlatform();
  const { lang } = useI18n();
  return async (url: string) => {
    const link = options.absolute ? url : absoluteUrl(url);
    const copied = await copyText(link);
    if (copied) toast(successText);
    else {
      toast(options.failureText ?? (lang === 'ko'
        ? '링크를 복사하지 못했습니다. 주소창의 주소를 직접 복사하세요.'
        : 'Could not copy the link. Copy the address from the address bar instead.'), 'warning');
      options.onFailure?.(link);
    }
    return copied;
  };
}
