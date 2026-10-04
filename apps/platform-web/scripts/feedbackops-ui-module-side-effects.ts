/**
 * FeedbackOps#747 will make the @fops/ui barrel tree-shake safe. Until then, treat its non-CSS source modules as
 * side-effect free so consumers keep only the primitives they use. Remove this override when #747 is integrated.
 */
export const feedbackOpsUiModuleSideEffects = (id: string): boolean | null => {
  const normalizedId = id.replaceAll('\\', '/');
  const sourcePath = normalizedId.split('?')[0] ?? normalizedId;
  if (!/(?:^|\/)products\/feedbackops\/packages\/ui\/src\//.test(sourcePath)) return null;
  if (sourcePath.endsWith('.css')) return null;
  return false;
};
