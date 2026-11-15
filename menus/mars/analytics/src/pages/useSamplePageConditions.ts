import { usePlatform } from '@ap/kernel';
import { usePageConditionOptionsLoader } from '@ap/components';
import { catalogConditionOptionsEndpoint, productivityConditionOptionsEndpoint } from '../endpoints';

/** The screen supplies its adapter only; PlatformPage owns every condition control and interaction. */
export function useSamplePageConditions() {
  const { route } = usePlatform();
  const spec = route?.menu.id === 'productivity-overview' ? productivityConditionOptionsEndpoint : catalogConditionOptionsEndpoint;
  const loader = usePageConditionOptionsLoader(spec, {});
  return route?.menu.pageConditions ? { ...loader, inputsKey: spec.id } : undefined;
}
