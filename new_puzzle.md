# Premise puzzle mode

## Product behavior

Premise selection replaces cast matching as the only main-round puzzle. It applies to the daily game and library “Play adaptation” practice:

- Show the generated book cover and TMDB adaptation poster side by side, with each title/year/identity shown once.
- Ask for the correct one-line `premise_short` from three shuffled choices.
- Use three hints: setting, character roles, and `premise_keywords`.
- Reuse the existing 3/2/1/1 scoring, five main rounds, reveal flow, and library saving.
- Keep Round 6 Common Thread and the 18-point daily completion model unchanged.
- Never show the correct `premise_short` or longer `story_premise` before submission.

## Implementation

1. Add `premise_short` (maximum 70 characters), two `premise_decoys`, and `premise_keywords` (`text[]`) to `catalog_items`.
2. Generate, validate, backfill, and upload all premise fields through the seeding pipeline.
3. Build deterministic premise choices in daily play and practice from two tailored, book-specific decoys; reject missing, duplicate, overlong, or obviously unlike-length choices, with the legacy same-genre catalog selector only as a temporary fallback.
4. Share one premise-question UI between daily play and practice.
5. Keep cast, director, poster, provider, and long-premise metadata on the reveal card only.
6. Preserve bonus scoring, saved score shape, streaks, sharing, and Daily Complete behavior.
7. Cover schema shape, choice mapping, concealment, hints, daily completion, and practice with tests.

## Notes

- `story_premise` remains as the longer editorial copy shown after answering.
- `premise_decoys` are original false premises generated for each book, not real premises borrowed from unrelated titles.
- Actor fields remain available for reveal-card metadata but no longer determine puzzle playability.
- There is no build-time puzzle selector and no retained cast mode.
