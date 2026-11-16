-- Custom equipment groups reuse saved-view persistence and object ACL (ADR-0164).
-- saved_views_menu_check already requires menu_id IS NULL for every non-menu-view kind.
ALTER TABLE platform.saved_views DROP CONSTRAINT saved_views_kind_check;
--> statement-breakpoint
ALTER TABLE platform.saved_views ADD CONSTRAINT saved_views_kind_check
  CHECK (kind IN ('condition-set', 'menu-view', 'custom-group'));
