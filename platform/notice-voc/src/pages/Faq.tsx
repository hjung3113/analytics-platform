import { HelpCircle } from 'lucide-react';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { PlatformPage } from '@ap/components';
import { Button, EmptyState } from '@ap/ui';

/** FAQ (ADR-0110 decision 2): the place is declared, the content is not. A plain notice instead of the Kernel's planned-menu diagnostics; the VOC link shows only for users who can open it. */
export default function Faq() {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { canOpen, linkTo } = usePlatform();
  return <PlatformPage description={ko ? '자주 묻는 질문' : 'Frequently asked questions'}>
    <EmptyState
      icon={<HelpCircle className="size-6" />}
      title={ko ? '준비 중입니다' : 'Coming soon'}
      body={ko ? '자주 묻는 질문은 준비 중입니다. 궁금한 점은 VOC로 남겨 주세요.' : 'Frequently asked questions are being prepared. Leave a VOC for anything you want to know.'}
      action={canOpen('voc') ? <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('voc')}>{ko ? 'VOC 남기기' : 'Open VOC'}</PlatformLink></Button> : undefined} />
  </PlatformPage>;
}
