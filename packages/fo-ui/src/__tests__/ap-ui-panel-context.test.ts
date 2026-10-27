import { useDetailPanelContent } from '@ap/ui';
import { useDetailPanelSlot } from '../index.js';

// FeedbackOps screens use the `@ap/ui` detail slot through one module instance: the FeedbackOps name is the same function.
it('names the @ap/ui detail slot registrant for FeedbackOps consumers', () => {
  expect(useDetailPanelSlot).toBe(useDetailPanelContent);
});
