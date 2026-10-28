/** Fixtures shared by the 대시보드 page and scope slot tests. */
import { ListTodo } from 'lucide-react';
import { createFoMenuHarness } from '@ap/feature-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFoMenuHarness({ manifests, homeMenuId: 'fo-dashboard', group: { id: 'foDashboard', label: { ko: '대시보드', en: 'Dashboard' }, icon: ListTodo }, detailSlot: false });
