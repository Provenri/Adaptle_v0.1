# Adaptle UI workflow

## Source of truth

- Read `DESIGN.md` before making visual changes.
- Read the relevant source screen, shared components, constants, fixtures, and tests before changing UI.
- The app is Expo Router + React Native with React Native Web. Existing React Native components and `StyleSheet` definitions outrank generic web patterns.

## React Native implementation

- Reuse existing `ThemedText`, `ThemedView`, `app-tabs`, `TypographicCover`, hooks, providers, Expo Router, and `useSafeAreaInsets` patterns.
- Do not use shadcn/ui, Tailwind, React DOM, direct HTML tags, React Navigation, or raw CSS in application components.
- Extend the existing `app/src/constants/theme.ts` and established data/provider layers when source requirements justify it.
- Add or update focused tests for behavior changed in the application.
- Run the smallest relevant lint, typecheck, and test commands.

## Existing commands

- Install app dependencies in `app/` when needed.
- Typecheck: `cd app && npm run typecheck`
- Lint: `cd app && npm run lint`
- Tests: `cd app && npm test -- --runInBand`

## Fidelity

- Exact repo copy and state are more important than visual embellishment.
- Do not invent content to make a screen "feel complete."
- Use embedded or repository asset paths when external images are unreliable.
- Preserve the existing light/dark platform behavior unless a change explicitly targets a particular mode.
