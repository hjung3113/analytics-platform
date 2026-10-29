// The `목록 범위` switch rule, shared by screen's own sidebar (`routes/_authed.tsx`) and the platform bridge's `ScopeControl`. Router-free so the
// bridge entry graph can import it. Each caller says which scope-bound keys its screen's search declares and maps the result onto its own key names.

export interface ScopeSwitchInput {
  /** The system chosen, or `undefined` for `전체`. */
  nextSystem: string | undefined;
  /** The current Analytics Area filter value (`unset` means "areas without one"). */
  area: string | undefined;
  declaresArea: boolean;
  declaresCursor: boolean;
}

/**
 * Which scope-bound search keys a scope change clears. A specific system drops the Analytics Area filter (it belongs to another system) unless it is
 * `unset`; any change drops a `cursor` the screen declares (cursors are bound to scope). Selection keys stay readable.
 */
export function scopeSwitchClears({
  nextSystem,
  area,
  declaresArea,
  declaresCursor,
}: ScopeSwitchInput): { area: boolean; cursor: boolean } {
  return {
    area: declaresArea && nextSystem !== undefined && area !== 'unset',
    cursor: declaresCursor,
  };
}
