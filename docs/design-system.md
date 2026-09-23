# Ragtime 5500 design system

The interface is treated as part of the application architecture. A user should be able to understand the filing workflow without reading implementation documentation.

## Product navigation

The primary workflow is intentionally ordered:

1. **Workspace** — Case → Plan → Plan Year → Filing hierarchy.
2. **Import** — eFAST CSV first, then locally downloaded Form 5500 PDFs.
3. **Review** — document matching and extracted-value verification.
4. **Explore** — deterministic structured queries and provenance.
5. **Database** — backup/restore and advanced read-only SQL.

The same information architecture is used on desktop and mobile. Desktop uses a persistent navigation rail; smaller screens use a horizontally scrollable workflow rail.

## Visual language

- Dark, low-glare operational interface.
- One restrained blue accent for primary actions and selection.
- Green is reserved for secure/ready states; red is reserved for destructive actions/errors.
- No gradients used as decoration; the subtle panel gradient only separates depth levels.
- System fonts only. No remote font loading is permitted.
- Monospace is reserved for hashes, SQL, identifiers, and provenance URLs.
- Spacing, radii, borders, and semantic colors are defined as CSS variables in `src/styles.css`.

## Interaction rules

- Every screen starts with a short purpose statement.
- Primary actions use direct verbs: Import, Verify, Execute, Export, Restore.
- Potentially destructive actions are visually distinct and require confirmation.
- Empty states explain what prerequisite action produces content.
- Long technical tables live in horizontally scrollable containers rather than forcing the full page wider.
- Exact values always expose provenance rather than showing a number without its source context.
- eFAST URLs are displayed as inert text only.

## Accessibility

- Native semantic controls are preferred over custom interaction widgets.
- Keyboard focus is always visible.
- Form controls have labels or explicit accessible names.
- Status and error messages use `role="status"` / `role="alert"` where appropriate.
- The layout preserves usable touch targets and collapses to one column on small screens.
- `prefers-reduced-motion` disables nonessential transitions.

## Offline design constraint

The design system may not introduce a runtime network dependency. Icons, fonts, CSS, component source, and any future UI package must be bundled locally. A visually attractive component is rejected if it weakens the zero-network guarantee.
