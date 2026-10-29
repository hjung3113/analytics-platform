import { useDetailPanelContent } from '@ap/ui';
import { useDetailPanelSlot } from '../index.js';

// Feature screens use the `@ap/ui` detail slot through one module instance: the feature name is the same function.
it('names the @ap/ui detail slot registrant for feature consumers', () => {
  expect(useDetailPanelSlot).toBe(useDetailPanelContent);
});
