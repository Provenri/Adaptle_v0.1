# Adaptle Stitch and UI workflow

## Source of truth

- Read `DESIGN.md` before generating, editing, or converting UI.
- Read the relevant source screen, shared components, constants, fixtures, and tests before asking Stitch to design anything.
- The app is Expo Router + React Native with React Native Web. Existing React Native components and `StyleSheet` definitions outrank generic web patterns.

## Stitch workflow

When asked to create or update Stitch screens:

1. Use the repository-local Stitch skills in `.github/skills/`.
2. Load the existing Adaptle Stitch project and design system before generation.
3. Preserve exact content, state, platform, behavior, accessibility, and negative constraints from the repo.
4. Sync `DESIGN.md` as the project-level design system when the design source changes.
   Use the design system asset recorded in `.stitch/metadata.json` for future
   generation. Do not blindly apply a newly created design system to already
   approved exact-reference screens; Stitch may regenerate new copies or change
   their device type. Ask before mutating accepted reference screens.
5. After a design system is applied, keep generation prompts focused on page structure, exact copy, state, and interactions; do not repeat the full color/font system in every new-screen prompt.
6. Prefer targeted screen edits over full regeneration after the first result.
7. Download and visually inspect the generated screenshot and HTML. Reject invented dates, rankings, metrics, controls, sections, or substituted assets.
8. Keep failed/replaced Stitch revisions hidden and label accepted screens clearly.
9. Before any mutation that uploads a new or changed design system, present a concise summary and obtain user approval when the selected skill requires it.

## React Native conversion

- Use the adapted `stitch-react-native` skill for Stitch-to-app conversion.
- Reuse existing `ThemedText`, `ThemedView`, `app-tabs`, `TypographicCover`, hooks, providers, Expo Router, and `useSafeAreaInsets` patterns.
- Do not use shadcn/ui, Tailwind, React DOM, direct HTML tags, React Navigation, or raw Stitch CSS in application components.
- Do not create `src/theme.ts` or `src/data/mockData.ts` merely because an upstream skill expects those files. Extend the repository's existing `app/src/constants/theme.ts` and established data/provider layers only when the source requirements justify it.
- Do not paste Stitch-generated raw HTML into `app/src`.
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
- Use embedded or repository asset paths when external images are unreliable in Stitch previews.
- Preserve the existing light/dark platform behavior; do not force dark-mode decisions on Stitch unless the requested screen explicitly targets dark mode.
