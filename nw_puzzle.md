# Premise puzzle mode (build-time selectable)

## Approach
Keep the existing "match the adaptation's actors" puzzle (type `cast`). Add a second type `premise`: book and adaptation shown side by side (no duplicated title/year/etc.), player picks the correct one-line premise from 3 choices. Hints: 1 setting, 2 characters, 3 premise keywords. Type is chosen at build time via `EXPO_PUBLIC_PUZZLE_TYPE` (`cast` default | `premise`) set per `eas.json` build profile. Applies to daily game and library practice.

## Todos
1. config: `src/lib/puzzle-type.ts` reading `EXPO_PUBLIC_PUZZLE_TYPE`, default `cast`; add to `.env.example`, `eas.json` profiles.
2. data: Supabase migration adding `premise_short` (<=~70 chars, one line) and `premise_keywords` (text[]) to `catalog_items`; update seeding `generate-hints.ts` / backfill step + tests.
3. data: premise decoys — pick other catalog items' `premise_short` (same genre preferred) in `daily-puzzle.ts` (`buildDailyPuzzle`, `fetchAdaptationPractice`); extend `CatalogRow`/`DailyRoundDetails`.
4. ui: side-by-side book/adaptation header (cover + poster, titles once); premise question view with choices (single-line, ellipsize); hint cards setting/characters/keywords; branch in `app/index.tsx` and `adaptation-practice.tsx` by puzzle type. Drop redundant title/author/year duplication.
5. engine: reuse `game-engine.ts` scoring/hints (3 hints, same points); bonus round unchanged.
6. tests: daily-puzzle (premise choices/decoys), screens (both types render), env default; run lint + jest.
7. docs: RELEASE_CHECKLIST note on choosing puzzle type per build.

## Notes
- Existing `story_premise` (14–24 words) stays; short premise is a new field. Rows lacking it fall back/invalidate in premise mode.
- Deps: 1 → 4; 2 → 3 → 4; 4 → 6.
