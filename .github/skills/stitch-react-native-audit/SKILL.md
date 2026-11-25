---
name: stitch-react-native-audit
description: Verify Adaptle Stitch-to-native output without rejecting valid React Native, existing component geometry, or platform-specific web files.
allowed-tools:
  - "Bash"
  - "Read"
---

# Audit Adaptle Stitch-to-native output

Use this skill after `stitch-react-native` creates or changes implementation
files.

## Inputs

- The generated or changed TypeScript/TSX paths.
- Repository-root `DESIGN.md`.
- `app/src/constants/theme.ts`.
- The relevant route, component, and focused test files when a diagnostic needs
  repository context.

## Run the audit

From the repository root:

```bash
cd app
npm run audit:stitch
```

To audit explicit files, including unchanged fixtures:

```bash
cd app
npm run audit:stitch -- src/app/example.tsx src/components/example.tsx
```

The default command audits changed and untracked files under `app/src`.
Explicit paths audit their complete contents. Use `--all` only when intentionally
measuring the entire baseline:

```bash
cd app
npm run audit:stitch -- --all
```

## Authoritative checks

The custom audit fails on native architectural drift:

- Web intrinsic elements in native TSX.
- `className` or DOM-only imports in native TSX.

It reports focused warnings for:

- New color literals not represented by `DESIGN.md` or `theme.ts`.
- New spacing-like numeric values that are not in the shared `Spacing` scale.
- New route/screen roots with no visible safe-area strategy.
- New `Pressable` controls without accessibility semantics.

Documented platform files such as `*.web.tsx` may use web-only APIs. React
Native `gap` and component-local geometry are valid and must not be rejected.

TypeScript and ESLint remain authoritative for React Native style-property
validity, imports, props, and typing. Do not duplicate their type checks in the
audit.

## Correct and verify

For each failing diagnostic:

1. Preserve the accepted visual and the existing screen's behavior.
2. Replace the web construct with the appropriate native primitive or existing
   Adaptle component.
3. Prefer a semantic token or a documented `DESIGN.md` color, then rerun audit.
4. Keep intentional dimensions local when they are component geometry rather
   than spacing.
5. Handle safe areas at the route/screen boundary with `SafeAreaView`,
   `useSafeAreaInsets`, or a documented owning component.

Finish with:

```bash
cd app
npm run audit:stitch
npm run typecheck
npm run lint
```

Run the smallest relevant Jest selector as well when behavior changed. Do not
silence diagnostics by adding broad exemptions, suppressions, or success-shaped
fallback behavior.
