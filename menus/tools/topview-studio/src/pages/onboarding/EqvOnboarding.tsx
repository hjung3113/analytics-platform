import { usePlatform } from '@ap/kernel';
import { PageKeyWarning, PlatformPage, usePageKeyRules } from '@ap/components';
import { EQUIPMENT_ID_PATTERN, WINDOW_HEX_PATTERN } from '../../endpoints';
import { isStep } from '../../model/onboarding';
import { Fleet } from './Fleet';
import { EquipmentWorkspace } from './EquipmentWorkspace';

const RULES = [
  { key: 'equipment', label: { ko: '설비', en: 'Equipment' }, valid: (raw: string) => EQUIPMENT_ID_PATTERN.test(raw) },
  { key: 'step', label: { ko: '단계', en: 'Step' }, valid: isStep },
  { key: 'window', label: { ko: 'Sample Window', en: 'Sample Window' }, valid: (raw: string) => WINDOW_HEX_PATTERN.test(raw) },
];

/** 설비 온보딩 (#1658): no `equipment` key is the Fleet; an equipment opens its step tabs. Every move is a push, so Back walks tab → Fleet. */
export default function EqvOnboardingScreen() {
  const { pageParam } = usePlatform();
  const rules = usePageKeyRules(RULES);
  if (rules.invalid) return <PlatformPage crumbs={[{ label: '설비 온보딩' }]}><div className="break-keep"><PageKeyWarning sentences={rules.sentences} onRecover={rules.recover} /></div></PlatformPage>;
  const equipmentId = pageParam('equipment');
  return equipmentId === null ? <Fleet /> : <EquipmentWorkspace key={equipmentId} equipmentId={equipmentId} />;
}
