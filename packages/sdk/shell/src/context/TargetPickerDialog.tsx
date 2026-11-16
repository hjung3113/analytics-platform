// The dialog's virtual list (@tanstack/virtual) must stay out of the start-up chunks (tooling/scripts/check-lazy-chunks.mjs),
// so `TargetPicker` loads this module lazily on the first open.
export { FacetedSetDialog as default } from '@ap/components';
