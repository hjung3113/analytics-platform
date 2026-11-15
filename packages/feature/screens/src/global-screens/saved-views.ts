// Lazy saved-view bridge entry; keep it out of the eagerly loaded core.
export { mapUnknownError } from '../lib/api/errorMapper';
export { createSavedView, deleteSavedView, fetchSavedViews } from '../lib/api/saved-views';
export type { SavedView } from '../lib/api/saved-views';
export { savedViewFilterToVocSearch, vocSearchToSavedViewFilter } from '../features/voc/lib/saved-view-keys';
export { searchHref } from '../lib/host/search';
