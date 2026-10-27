import { useI18n, usePlatform } from '@ap/kernel';
import { copyText } from '@ap/ui';

// The plain-text copy and its one success rule live in @ap/ui (06 §15, #673); re-exported so the components API keeps `copyText`.
export { copyText };

/**
 * Link-copy click handler (#300): copies the deployment-aware absolute URL and toasts the caller's success text only after the
 * write actually completed; a refusal or unsupported environment gets a `warning` naming cause and action
 * (06 §26). Consumers stay free of success/failure judgement — this hook owns it.
 */
export function useCopyLink(successText: string): (url: string) => void {
  const { toast, absoluteUrl } = usePlatform();
  const { lang } = useI18n();
  return (url: string) => {
    void copyText(absoluteUrl(url)).then(copied => {
      if (copied) toast(successText);
      else toast(lang === 'ko'
        ? '링크를 복사하지 못했습니다. 주소창의 주소를 직접 복사하세요.'
        : 'Could not copy the link. Copy the address from the address bar instead.', 'warning');
    });
  };
}
