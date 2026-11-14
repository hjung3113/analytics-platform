import { useMessages, PlatformLink, usePlatform } from '@ap/kernel';
import { NOTICE_VOC_MESSAGES } from '../messages';
import { HelpCircle } from 'lucide-react';
import { PlatformPage } from '@ap/components';
import { Button, EmptyState } from '@ap/ui';

/** FAQ (ADR-0110 decision 2): the place is declared, the content is not. A plain notice instead of the Kernel's planned-menu diagnostics; the VOC link shows only for users who can open it. */
export default function Faq() {
  const m = useMessages(NOTICE_VOC_MESSAGES);
  const { canOpen, linkTo } = usePlatform();
  return <PlatformPage description={m('faqFrequentlyAskedQuestions')}>
    <EmptyState
      icon={<HelpCircle className="size-6" />}
      title={m('faqComingSoon')}
      body={m('faqFrequentlyAskedQuestionsAreBeingPreparedLeave')}
      action={canOpen('voc') ? <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('voc')}>{m('faqOpenVOC')}</PlatformLink></Button> : undefined} />
  </PlatformPage>;
}
