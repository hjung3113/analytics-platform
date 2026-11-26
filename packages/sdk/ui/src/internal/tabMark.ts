// The confirmed tab selection mark (#340): a 2px accent bar under the selected tab, drawn by the element's own ::after,
// kept as a current-colour border in forced colours. Shared by `PlatformTabs` and `ListTabs` (#3154) so every tab strip
// marks its selection the same way, never by colour alone (WCAG 1.4.1). The selector that shows it stays with each caller.
export const TAB_MARK_BASE = 'after:absolute after:inset-x-3 after:bottom-0 after:hidden after:h-0.5 after:rounded-pill after:bg-accent-primary forced-colors:after:bg-transparent forced-colors:after:border-b-2 forced-colors:after:border-current';
