// 713q rewrite step (called by 713q.sh): FeedbackOps consumers import SDK-owned parts from `@ap/ui` directly;
// `@fops/ui` keeps only the FO-local names. Idempotent: a second run finds nothing left to change.
// Usage (repo root): node .agents/conductor/moves/713q.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const ts = createRequire(path.join(root, 'packages/fo-ui/'))('typescript');
const DRY = process.argv.includes('--dry');

// Names @fops/ui re-exported from @ap/ui under the same name (compatibility re-exports, removed by 713q).
const A = new Set(["ActiveFilterBar","ActiveFilterBarProps","Alert","AlertDescription","AlertDialog","AlertDialogAction","AlertDialogCancel","AlertDialogContent","AlertDialogDescription","AlertDialogFooter","AlertDialogHeader","AlertDialogOverlay","AlertDialogPortal","AlertDialogTitle","AlertDialogTrigger","AlertTitle","AttachButton","AttachButtonProps","AttachmentRef","AttachmentRefAttrs","Avatar","AvatarFallback","AvatarImage","AvatarUser","Badge","BadgeProps","Button","ButtonProps","Callout","CalloutProps","CalloutTone","Card","CardContent","CardDescription","CardFooter","CardHeader","CardTitle","Checkbox","Combobox","ComboboxOption","ComboboxProps","DIALOG_CONTENT_MOTION","DatePicker","DatePickerProps","DetailPanelFullscreenContext","DetailPanelFullscreenToggle","DetailPanelFullscreenValue","DetailPanelHeader","DetailPanelHeaderActions","DetailPanelHeaderActionsProps","DetailPanelHeaderProps","DetailPanelKind","DetailPanelReadingColumn","DetailPanelSectionNav","DetailPanelSectionNavProps","DetailPanelSlotProvider","Dialog","DialogClose","DialogContent","DialogContentBare","DialogDescription","DialogFooter","DialogHeader","DialogOverlay","DialogPortal","DialogTitle","DialogTrigger","DirtyConfirmation","DirtyConfirmationProps","DropdownMenu","DropdownMenuCheckboxItem","DropdownMenuContent","DropdownMenuGroup","DropdownMenuItem","DropdownMenuLabel","DropdownMenuPortal","DropdownMenuRadioGroup","DropdownMenuRadioItem","DropdownMenuSeparator","DropdownMenuShortcut","DropdownMenuSub","DropdownMenuSubContent","DropdownMenuSubTrigger","DropdownMenuTrigger","EmptyState","EmptyStateProps","FieldLabel","FieldLabelProps","FieldRow","FieldRowProps","FilterCategory","HoverCard","HoverCardContent","HoverCardTrigger","Input","InputProps","KeyboardShortcut","KeyboardShortcutProps","Label","ListFilterButton","ListFilterButtonProps","ListShell","ListShellProps","ListSortButton","ListSortButtonProps","ListTabs","ListTabsProps","ListToolbar","ListToolbarProps","ListToolbarTab","Mention","MentionAttrs","NestedTextBlock","NestedTextBlockProps","ObjectRow","ObjectRowDensity","ObjectRowProps","ObjectRowSeverity","POPPER_CONTENT_MOTION","PageShell","PageShellProps","PanelSection","PanelSectionTitle","PanelSectionTitleProps","PanelTitleBlock","PanelTitleBlockProps","PermissionBlockedPanel","PermissionBlockedPanelProps","PermissionState","Popover","PopoverAnchor","PopoverContent","PopoverTrigger","PreviewModal","PreviewModalProps","ProgressMeter","ProgressMeterProps","RadioGroup","RadioGroupItem","RichContentMode","RichContentRenderer","RichContentRendererProps","RichEditor","RichEditorAttachmentResult","RichEditorProps","RichEditorSurface","RichEditorToolbarApi","SCRIM_MOTION","SELECT_CONTENT_MOTION","SHEET_CONTENT_MOTION","SearchInput","SearchInputProps","Select","SelectContent","SelectGroup","SelectItem","SelectLabel","SelectScrollDownButton","SelectScrollUpButton","SelectSeparator","SelectTrigger","SelectValue","SeverityEnum","SeverityIndicator","SeverityIndicatorProps","Sheet","SheetClose","SheetContent","SheetDescription","SheetFooter","SheetHeader","SheetOverlay","SheetPortal","SheetTitle","SheetTrigger","ShellHeader","ShellHeaderProps","Skeleton","SkeletonBlock","SkeletonBlocks","SkeletonBlocksProps","SkeletonRows","SkeletonRowsProps","SortOption","StatusBadgeAppearance","StatusBadgeFrame","StatusBadgeFrameProps","StatusBadgeTone","Tabs","TabsContent","Textarea","TextareaProps","TipTapDoc","ToggleGroup","ToggleGroupItem","ToolbarKicker","ToolbarKickerProps","Tooltip","TooltipContent","TooltipProvider","TooltipTrigger","UndoToast","UndoToastProps","UserAvatar","UserAvatarProps","UserChip","UserChipProps","WorkbenchShell","WorkbenchShellProps","badgeVariants","buttonVariants","cn","isToastTarget","prefersReducedMotion","readMotionTiming","useDetailPanelSlotHost","useListMotion"]);

const UI_SRC = 'packages/fo-ui/src';
// Compatibility re-export files that 713q deletes (path without extension, relative to the repo root).
const DELETED = new Set(
  `components/Button components/SkeletonBlocks components/SkeletonRows
components/shadcn/alert-dialog components/shadcn/avatar components/shadcn/badge components/shadcn/card
components/shadcn/checkbox components/shadcn/combobox components/shadcn/dialog components/shadcn/dropdown-menu
components/shadcn/input components/shadcn/label components/shadcn/popover components/shadcn/radio-group
components/shadcn/select components/shadcn/sheet components/shadcn/skeleton components/shadcn/tabs
components/shadcn/toggle-group components/shadcn/tooltip
badges/StatusBadgeFrame data/ObjectRow
feedback/DirtyConfirmation feedback/EmptyState feedback/PreviewModal feedback/UndoToast
forms/DatePicker forms/FieldLabel forms/SearchInput identity/UserAvatar identity/UserChip
indicators/ProgressMeter layout/ListShell layout/PageShell layout/ShellHeader layout/ToolbarKicker layout/WorkbenchShell
panel/Callout panel/DetailPanelFullscreenContext panel/DetailPanelHeader panel/DetailPanelHeaderActions
panel/DetailPanelSectionNav panel/FieldRow panel/NestedTextBlock panel/PanelSectionTitle panel/PanelTitleBlock
permissions/PermissionBlockedPanel rich-content/extensions/attachmentRef rich-content/extensions/mention
rich-content/RichContentRenderer rich-content/RichEditor rich-content/toolbar/AttachButton
toolbar/ActiveFilterBar toolbar/ListFilterButton toolbar/ListSortButton toolbar/ListTabs toolbar/ListToolbar
utils/cn utils/motion utils/toast-target utils/useListMotion`
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => `${UI_SRC}/${p}`),
);
const SLOT = `${UI_SRC}/layout/useDetailPanelSlot`; // kept: FO alias `useDetailPanelContent as useDetailPanelSlot`
const TABS = `${UI_SRC}/components/shadcn/tabs`;
const INDEX = `${UI_SRC}/index`;

export const deletedFiles = () =>
  [...DELETED].flatMap((b) => ['.ts', '.tsx'].map((e) => b + e)).filter((f) => fs.existsSync(f));

const SCAN = ['apps/fo-frontend', 'apps/fo-backend', 'apps/platform-web', 'packages/fo-ui', 'packages/fo-bridge', 'packages/fo-shared', 'menus/feedbackops', 'menus/_global'];
const files = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', 'dist', '.turbo', 'test-results', 'playwright-report'].includes(e.name)) walk(p);
    } else if (/\.(ts|tsx|mts)$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(p);
  }
})('.');
const scanned = files.filter((f) => SCAN.some((s) => f.startsWith(s + "/")));

const manual = [];
const changed = [];

function kindOf(spec, file) {
  if (spec === '@fops/ui') return { kind: 'index' };
  if (!spec.startsWith('.')) return null;
  const base = path.relative(root, path.resolve(root, path.dirname(file), spec)).replace(/\.(js|ts|tsx)$/, '');
  if (base === INDEX || base === UI_SRC) return { kind: 'index', relative: true };
  if (base === SLOT) return { kind: 'slot', relative: true };
  if (DELETED.has(base)) return { kind: base === TABS ? 'tabs' : 'pure', relative: true };
  return null;
}
// true = the name comes from @ap/ui; false = stays on the original FO module
function isAp(kind, name) {
  if (kind === 'index') return A.has(name);
  if (kind === 'slot') return name === 'DetailPanelSlotProvider' || name === 'useDetailPanelSlotHost';
  if (kind === 'tabs') return name !== 'TabsList' && name !== 'TabsTrigger';
  return true; // pure
}
const insideMock = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && /^vi\.(mock|doMock)$/.test(p.expression.getText())) return true; return false; };
const quoteOf = (lit) => lit.getText()[0];

for (const file of scanned) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/fops\/ui|\.\.?\//.test(src)) continue;
  const isFoUi = file.startsWith(UI_SRC + '/') || file.startsWith('packages/fo-ui/__tests__/');
  const stem = file.replace(/\.(ts|tsx|mts)$/, '');
  if (file.startsWith(UI_SRC + '/') && (DELETED.has(stem) || stem === INDEX)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = []; // {start,end,text}

  const decls = sf.statements.filter((s) => (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier);
  for (const st of decls) {
    const spec = st.moduleSpecifier.text;
    const k = kindOf(spec, file);
    if (!k) continue;
    if (file === `${UI_SRC}/layout/useDetailPanelSlot.ts`) continue;
    const isImport = ts.isImportDeclaration(st);
    const clause = isImport ? st.importClause : st.exportClause;
    const named = isImport ? clause?.namedBindings : st.exportClause;
    if (!named || !ts.isNamedImports(named) && !ts.isNamedExports(named) || (isImport && clause.name)) {
      manual.push(`${file}: ${st.getText().split('\n')[0]} (default/namespace/star)`);
      continue;
    }
    const typeOnly = isImport ? clause.isTypeOnly : st.isTypeOnly;
    const ap = [], rest = [];
    for (const el of named.elements) (isAp(k.kind, (el.propertyName ?? el.name).text) ? ap : rest).push(el.getText());
    if (!ap.length) continue;
    const q = quoteOf(st.moduleSpecifier);
    const kw = isImport ? 'import' : 'export';
    const tk = typeOnly ? ' type' : '';
    const mk = (els, from) => `${kw}${tk} { ${els.join(', ')} } from ${q}${from}${q};`;
    const indent = '';
    const text = rest.length ? `${mk(ap, '@ap/ui')}\n${indent}${mk(rest, spec)}` : mk(ap, '@ap/ui');
    edits.push({ start: st.getStart(), end: st.getEnd(), text });
  }

  // vi.mock / doMock / importActual / import('…') type nodes
  (function visit(n) {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText();
      const a0 = n.arguments[0];
      if (/^vi\.(mock|doMock|unmock|importMock)$/.test(callee) && a0 && ts.isStringLiteralLike(a0)) {
        const k = kindOf(a0.text, file);
        if (k) {
          if (/^vi\.(mock|doMock)$/.test(callee)) {
            const keys = []; let spread = false; let obj = null;
            (function w(m) {
              if (!obj && ts.isObjectLiteralExpression(m)) {
                obj = m;
                for (const p of m.properties) { if (ts.isSpreadAssignment(p)) spread = true; else if (p.name) keys.push(p.name.getText()); }
                return;
              }
              ts.forEachChild(m, w);
            })(n.arguments[1] ?? n);
            const allAp = keys.length > 0 && keys.every((x) => isAp(k.kind, x));
            const noneAp = keys.every((x) => !isAp(k.kind, x));
            if (allAp && !k.relative) {
              n.forEachChild(function r(m) {
                if ((ts.isStringLiteralLike(m) && m.text === '@fops/ui')) edits.push({ start: m.getStart(), end: m.getEnd(), text: quoteOf(m) + '@ap/ui' + quoteOf(m) });
                ts.forEachChild(m, r);
              });
            } else if (!k.relative && obj && spread && !allAp && !noneAp && n.arguments[1]) {
              // Mixed factory: the @ap/ui-owned overrides move to vi.mock('@ap/ui'), the FO-local ones stay on '@fops/ui'.
              const f = n.arguments[1];
              const base = f.getStart();
              const variant = (wantAp) => {
                const props = obj.properties.filter((p) => ts.isSpreadAssignment(p) || (isAp(k.kind, p.name.getText()) === wantAp));
                const body = '{\n' + props.map((p) => p.getText()).join(',\n') + ',\n}';
                let t = src.slice(base, obj.getStart()) + body + src.slice(obj.getEnd(), f.getEnd());
                if (wantAp) t = t.split(quoteOf(a0) + '@fops/ui' + quoteOf(a0)).join(quoteOf(a0) + '@ap/ui' + quoteOf(a0));
                return t;
              };
              const q = quoteOf(a0);
              edits.push({ start: n.getStart(), end: n.getEnd(), text: `${callee}(${q}@ap/ui${q}, ${variant(true)});\n${callee}(${q}@fops/ui${q}, ${variant(false)})` });
            } else if (!noneAp || k.relative) manual.push(`${file}: ${callee}(${a0.getText()}) keys=[${keys}]`);
          } else manual.push(`${file}: ${callee}(${a0.getText()})`);
        }
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
  // import('@fops/ui').Name type references: an @ap/ui-owned Name moves to '@ap/ui'
  (function visit(n) {
    if (ts.isImportTypeNode(n) && n.qualifier && ts.isLiteralTypeNode(n.argument) && n.argument.literal.text === '@fops/ui') {
      const first = ts.isIdentifier(n.qualifier) ? n.qualifier.text : n.qualifier.left.getText().split('.')[0];
      if (A.has(first)) edits.push({ start: n.argument.literal.getStart(), end: n.argument.literal.getEnd(), text: quoteOf(n.argument.literal) + '@ap/ui' + quoteOf(n.argument.literal) });
    }
    ts.forEachChild(n, visit);
  })(sf);
  // typeof import('@fops/ui') outside a handled vi.mock: report
  (function visit(n) {
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && n.argument.literal.text === '@fops/ui' && !edits.some((e) => e.start === n.argument.literal.getStart()) && !insideMock(n)) {
      manual.push(`${file}: typeof import('@fops/ui') outside an auto-handled vi.mock`);
    }
    ts.forEachChild(n, visit);
  })(sf);

  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  out = mergeApImports(out, file);
  if (out !== src) { changed.push(file); if (!DRY) fs.writeFileSync(file, out); }
}

// Merge several `import { … } from '@ap/ui'` statements of the same type-ness into the first one.
function mergeApImports(text, file) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const groups = new Map();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.moduleSpecifier.text !== '@ap/ui') continue;
    const c = st.importClause;
    if (!c || c.name || !c.namedBindings || !ts.isNamedImports(c.namedBindings)) continue;
    const key = c.isTypeOnly ? 'type' : 'value';
    (groups.get(key) ?? groups.set(key, []).get(key)).push(st);
  }
  const edits = [];
  for (const sts of groups.values()) {
    if (sts.length < 2) continue;
    const els = [...new Set(sts.flatMap((s) => s.importClause.namedBindings.elements.map((e) => e.getText())))];
    const first = sts[0], q = first.moduleSpecifier.getText()[0];
    edits.push({ start: first.getStart(), end: first.getEnd(), text: `import${first.importClause.isTypeOnly ? ' type' : ''} { ${els.join(', ')} } from ${q}@ap/ui${q};` });
    for (const s of sts.slice(1)) {
      let end = s.getEnd();
      if (text[end] === '\n') end += 1;
      edits.push({ start: s.getFullStart() === s.getStart() ? s.getStart() : s.getStart(), end, text: '' });
    }
  }
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

console.log(`713q.mjs: ${changed.length} file(s) rewritten${DRY ? ' (dry run)' : ''}`);
if (manual.length) console.log('MANUAL (not rewritten):\n' + manual.map((m) => '  ' + m).join('\n'));
