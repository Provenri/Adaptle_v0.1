---
name: stitch-react-native
description: Convert or compare verified Stitch screens with this Expo Router and React Native codebase without replacing repository architecture.
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Stitch to Adaptle React Native

This is Adaptle's builder skill. Use it only after a Stitch screen has been
inspected and accepted as a visual reference. The goal is to update the
existing Expo/React Native application without importing Stitch's raw HTML/CSS
architecture. Pair this skill with `stitch-react-native-audit` after generation.

## Required inputs

Read, in order:

1. repository-root `DESIGN.md`
2. the relevant files under `app/src/app/`
3. shared components under `app/src/components/`
4. `app/src/constants/theme.ts`, `app/src/global.css`, and relevant fixtures/tests
5. the accepted Stitch screen screenshot, HTML, and metadata

If the accepted screen and source implementation disagree, preserve the source
application's behavior and exact copy unless the user explicitly requests a
behavior or content change.

## Retrieval and audit

1. Use `list_screens` and `get_screen` for the target Stitch project.
2. Download the selected screen's HTML and screenshot with `scripts/fetch-stitch.sh`.
3. Inspect the screenshot and HTML before editing application code.
4. Store reusable downloaded assets in `.stitch/designs/` and project metadata in
   `.stitch/metadata.json` only if the user requested a persistent local sync.
5. If local copies already exist, inspect their timestamps and ask before
   replacing them.

## Architectural rules

This repository already defines its architecture. Preserve it:

- Expo Router routes under `app/src/app/`
- React Native primitives and `StyleSheet`
- `ThemedText`, `ThemedView`, `useTheme`, and `app-tabs`
- Expo Router tabs/links/modals
- `react-native-safe-area-context`
- `react-native-svg` for vector UI
- Existing providers, hooks, data types, and fixtures

Do not introduce:

- HTML tags or raw Stitch HTML in `app/src`
- Tailwind or shadcn/ui
- React DOM/CSS class assumptions
- React Navigation packages or a parallel navigator
- a new `src/theme.ts`
- a new `src/data/mockData.ts`
- generated atoms/molecules/organisms folders unless the existing repository
  already needs that extraction

## Mapping

Translate accepted visuals into the existing source:

- `div`, `section`, `main` → `View`, `ScrollView`, or an existing wrapper
- text → `ThemedText` or `Text` when the existing component requires it
- buttons/links → `Pressable`, Expo Router `Link`, or existing helpers
- inputs → `TextInput`
- images → Expo `Image`, local `require`, or the existing TMDB URL pattern
- SVG → `react-native-svg`
- CSS flex/color/radius/spacing → `StyleSheet` values and existing token helpers

## Theme and data handling

- Extend `app/src/constants/theme.ts` only when a new semantic token is genuinely
  required.
- Reuse `Colors`, `Fonts`, `Spacing`, `BottomTabInset`, and `MaxContentWidth`.
- Preserve component-local styles when the repository already models the
  behavior that way.
- Use production providers, fixtures, and typed data; do not invent mock content
  merely to match a Stitch screenshot.
- Keep copy and behavior in the same layer the existing screen uses unless
  extraction improves a concrete duplication problem.

## Accessibility and interaction

- Preserve `accessibilityRole`, `accessibilityLabel`, `accessibilityState`, and
  hints from the source screen.
- Preserve tap behavior, disabled states, safe areas, keyboard behavior, and
  modal/scroll behavior.
- Keep minimum touch targets and the existing floating tab clearance.

## Implementation sequence

1. Identify the smallest source component/screen that owns the requested UI.
2. Compare the accepted Stitch visual with the existing implementation.
3. Make surgical React Native changes; do not rewrite unrelated architecture.
4. Add or update focused tests only for behavior this change introduces or fixes.
5. Run:
   - `cd app && npm run audit:stitch`
   - `cd app && npm run typecheck`
   - the smallest relevant Jest selector
   - `cd app && npm run lint` when the changed files warrant it
6. Do not start Expo, simulators, or device builds unless the user asks.
7. Report any Stitch behavior that cannot be represented by the current app
   rather than silently inventing it.

## Resources

The copied upstream resources are reference-only:

- `scripts/fetch-stitch.sh` — reliable Stitch asset download
- `resources/component-template.tsx` — generic mapping aid
- `resources/architecture-checklist.md` — generic upstream checklist

Do not run the copied `scripts/validate.js` as an Adaptle gate. Its mandatory
Props-interface, no-hex, `src/theme.ts`, `mockData.ts`, and React Navigation
assumptions conflict with this repository. Use the project audit command and the
repository checks listed above instead.

## Audit handoff

After generation, invoke `stitch-react-native-audit` with the files created or
changed. If audit diagnostics require a correction, make the correction in the
generated implementation and rerun the audit plus TypeScript. Do not weaken
audit rules or add broad file exemptions merely to make generated output pass.
