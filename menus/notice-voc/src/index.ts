/**
 * @ap/menu-notice-voc — noticeVoc group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { lazy } from 'react';
import { Megaphone, MessageSquareWarning } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'notices', primary: true, group: 'noticeVoc', label: { ko: '공지', en: 'Notices' },
    description: { ko: '공지 목록/상세', en: 'Notice list/detail' },
    path: '/notices', icon: Megaphone, permission: 'notice:view', requiresScope: false, pageType: 'management', context: none, features: noFeatures, pageKeys: [],
  },
  {
    id: 'voc', group: 'noticeVoc', label: { ko: 'VOC', en: 'VOC' },
    description: { ko: '내가 접수한 VOC 상태. 등록은 FeedbackOps로 이동합니다.', en: 'Status of VOCs you filed. Filing opens FeedbackOps.' },
    path: '/voc', icon: MessageSquareWarning, permission: 'voc:view', requiresScope: false, pageType: 'management', context: none,
    features: noFeatures, pageKeys: ['cursor'],
    component: lazy(() => import('./pages/MyVocHistory')),
  },
];
