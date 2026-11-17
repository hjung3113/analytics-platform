export type MatrixCellTone = 'info' | 'danger' | 'missing' | 'muted';
export const MATRIX_TONE_CLASS: Record<MatrixCellTone, string> = {
  info: 'bg-accent-primary-soft font-semibold text-accent-primary',
  danger: 'bg-accent-danger-soft text-text-danger-label',
  missing: 'surface-hatched text-text-muted',
  muted: 'text-text-muted',
};
