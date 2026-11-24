// Approved cross-module read surface of the permissions module (docs/02-domain-module-boundaries.md).
// The single-target request decision shared by `/me/permissions/check` and the VOC list hints (#2675).
export { checkPermissionRequestTarget } from './request-target.js';
