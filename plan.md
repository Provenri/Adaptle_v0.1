# Adaptle — Implementation Plan

## Problem & Approach

The repository contains only the product blueprint ([Adaptle.md](/workspaces/Adaptle_v0.1/Adaptle.md)). We will build the full product from scratch:

- **Frontend:** Expo (Managed Workflow + Expo Router) + TypeScript, Android-first dev loop via Expo Go (tunnel mode from Codespaces), with iOS/Web builds kept green.
- **Backend:** Supabase (Frankfurt `eu-central-1`) — Postgres schema, RLS, anonymous auth, `pg_cron` daily publisher, Deno Edge Functions proxying TMDB/Open Library.
- **Content:** Real one-time offline seeding pipeline (Wikidata SPARQL → Open Library → TMDB → LLM hints) producing 250 puzzles + 50 common-thread pairs.
- **Roadmap:** Phase 1 MVP fully working; Phase 2 (retention) and Phase 3 (monetization) scaffolded behind feature flags.

Repository layout:

```
/app            Expo app (Expo Router, 2 tabs)
/supabase       migrations, RLS policies, pg_cron, edge functions (Deno)
/seeding        Node/TS offline seeding pipeline + prompts
```

---

## Phase 0 — Foundation

### 0.1 Scaffold Expo app
- `npx create-expo-app` (managed, TypeScript, Expo Router) in `/app`.
- 2-tab layout: `Play` and `My Library` (per wireframes §5).
- Deps: `react-native-svg`, `expo-linear-gradient`, `react-native-view-shot`, `expo-sharing`, `expo-camera`, `@tanstack/react-query`, `react-native-mmkv`, `@supabase/supabase-js`.
- Tooling: ESLint + Prettier, Jest + `@testing-library/react-native`, strict `tsconfig`.
- Android dev loop: Expo Go + `npx expo start --tunnel` (works from Codespaces).

### 0.2 Supabase project wiring
- `supabase init` in `/supabase`; link to the user's Frankfurt project (needs project ref + access token from user).
- `.env` handling: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`; server-side secrets (TMDB key, service role) only in Edge Function secrets / seeding `.env` (never committed).

---

## Phase 1 — MVP

### 1.1 Database schema & security (migrations)
- 4 tables per blueprint §6: `catalog_items`, `common_thread_pairs`, `user_library`, `daily_scores` (+ indexes on `scheduled_date`, FKs, unique constraints).
- RLS: `catalog_items`/`common_thread_pairs` readable by all authenticated (incl. anonymous) users **but only rows with `scheduled_date <= today`** (prevents puzzle leaks); `user_library`/`daily_scores` owner-only CRUD.
- Anonymous sign-in enabled; later account linking (Apple/Google) stubbed for Phase 2.
- `pg_cron`: the daily puzzle is selected purely by `scheduled_date`, so the cron job is a safety check/materializer (e.g., refresh a `daily_puzzle` view or notify); keep logic in SQL.

### 1.2 Edge Functions (Deno/TS)
- `tmdb-proxy`: movie details, posters, watch providers (keeps TMDB key server-side; adds attribution fields).
- `booksearch-proxy`: Open Library search + Google Books ISBN fallback for `+ Add Book` (strips `description`/`imageLinks` per copyright rules).
- Shared CORS/auth middleware; unit tests via `deno test`.

### 1.3 Offline seeding pipeline (`/seeding`, Node/TS CLI)
1. `fetch-wikidata`: SPARQL query for book→film pairs (`P144`, `P212` ISBN, `P50` author, `P4947` TMDB id); emits candidate list.
2. `enrich-openlibrary`: title/author/genre/pages from CC0 API (excluding `description`/covers); assign `cover_theme` from genre mapping (§3).
3. `enrich-tmdb`: movie title, year, director, poster path, lead cast → `lead_characters`.
4. `generate-hints`: LLM calls (OpenAI API — user already has a key; a mini-tier model is sufficient and cheap for ~300 short completions) using Prompt A (§7) — only book title+author as input, never TMDB text. Structured Outputs (JSON schema) + Zod validation.
5. `generate-threads`: Prompt B (§7) for 50 common-thread pairs across the 3 pair modes, with decoys.
6. `schedule-and-upload`: assign `scheduled_date` sequence, shuffle decoy character pairs, upsert to Supabase via service role key.
- Each step writes JSON checkpoints to `/seeding/out/` so steps are re-runnable/resumable; include a small `--limit 10` dev mode for fast iteration.
- **User-provided keys needed:** TMDB API key, OpenAI API key, Supabase service role key.

### 1.4 Game engine & Play tab
- Pure-TS game state machine (unit-testable, no React): rounds 1–5 → bonus → summary; hint ladder scoring (3/2/1/1, wrong = 0); bonus +3; 18 max.
- Screens per wireframes: State A (question + hint ladder), State B (reveal card + 1-tap shelf saves), State C (common thread bonus), State D (summary + emoji share text + `view-shot` share card).
- Decoy answers: character pairs from two other adaptations (from puzzle payload), shuffled deterministically per day.
- Streak logic: computed from `daily_scores` history; local-first with MMKV, synced to Supabase.
- Hint 3 (masked movie title): client-side hangman masking of `movie_title`.

### 1.5 Typographic cover component
- `<TypographicCover>` SVG component rendering 2:3 covers from title/author/`cover_theme` using the 6 palettes + motifs table (§3): gradients + simple geometric motifs per theme; dynamic font sizing for long titles.
- Reused in Play prompt, bonus round, library cards, and share card.

### 1.6 My Library tab
- Shelf chips (`To be read` / `Finished` / `Snooze`) with counts, search, status filter.
- Book cards: typographic cover, adaptation info (movie, year, streaming via `tmdb-proxy`), status dropdown.
- `+ Add Book`: Open Library text search + `expo-camera` ISBN barcode scan → `booksearch-proxy`; manual books get `tmdb_id = null`.
- Empty state onboarding screen (per wireframe).

### 1.7 Offline & data layer
- TanStack Query + MMKV persister: today's puzzle prefetched and playable offline; mutations (shelf saves, scores) queued and retried when online.
- Supabase client with anonymous session persistence in MMKV.

### 1.8 QA pass
- Jest unit tests: game engine, scoring, cover theme mapping, hangman masking, streaks.
- Manual E2E on Android (Expo Go): full daily loop, offline replay, library CRUD, share card.

---

## Phase 2 — Retention & Polish (scaffolding + implementation where no external blockers)

- **Push notifications:** `expo-notifications` daily reminder (local scheduled notification at launch; Expo Push via Supabase later).
- **Reader DNA:** attribute bars computed client-side from saved-book genres; new section in My Library.
- **DNB German catalog:** add `language` column + seeding adapter stub for Deutsche Nationalbibliothek (CC0); behind a feature flag.
- **Account linking:** Apple/Google sign-in linking to the anonymous user (Supabase `linkIdentity`).

## Phase 3 — Monetization (scaffolding only)

- Feature-flag framework (`app_config` table + local overrides).
- **Adaptle Plus** gating: archive puzzle screen (locked state), streaming release alerts stub, paywall placeholder screen.
- TMDB commercial-license checklist documented in README; no payment SDK integration yet (needs store accounts).

---

## Todos (tracked in SQL)

| # | ID | Depends on |
|---|----|------------|
| 1 | scaffold-expo-app | — |
| 2 | supabase-setup | — |
| 3 | db-schema-rls | supabase-setup |
| 4 | edge-functions | supabase-setup |
| 5 | seeding-wikidata-ol | — |
| 6 | seeding-tmdb-llm | seeding-wikidata-ol |
| 7 | seeding-upload | seeding-tmdb-llm, db-schema-rls |
| 8 | cover-component | scaffold-expo-app |
| 9 | game-engine | scaffold-expo-app |
| 10 | play-tab-screens | game-engine, cover-component |
| 11 | reveal-share | play-tab-screens, edge-functions |
| 12 | library-tab | cover-component, edge-functions |
| 13 | offline-data-layer | scaffold-expo-app, db-schema-rls |
| 14 | streaks-scores | offline-data-layer, game-engine |
| 15 | qa-mvp | play-tab-screens, reveal-share, library-tab, streaks-scores, seeding-upload |
| 16 | phase2-notifications | qa-mvp |
| 17 | phase2-reader-dna | qa-mvp |
| 18 | phase2-dnb-linking | qa-mvp |
| 19 | phase3-scaffolding | qa-mvp |

## Notes & Considerations

- **Secrets:** TMDB key, OpenAI key, Supabase service-role key, and Supabase project ref must come from the user; I'll pause and ask when wiring them. Nothing secret gets committed.
- **LLM provider:** OpenAI instead of Gemini (user already has a key). The seeding LLM step is provider-isolated behind a small interface, so swapping providers later is a one-file change.
- **Copyright guardrails baked in:** no Open Library `description`, no publisher cover images, TMDB text never sent to LLM, TMDB attribution shown on reveal cards.
- **Codespaces + Android:** Expo tunnel mode lets a physical Android device with Expo Go connect to the Codespace dev server.
- **pg_cron nuance:** since content is pre-scheduled by `scheduled_date`, "publishing at midnight" is enforced by RLS date filtering rather than a cron mutation; cron used for housekeeping (e.g., leaderboard/streak maintenance) only if needed.
- **Blueprint ambiguity (resolved in-plan):** blueprint says each round shows 3 character pairs "from three adaptations" — decoys will be drawn from other catalog items' adaptations in the same day's payload.
