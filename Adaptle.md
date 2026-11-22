# Adaptle — Product & Technical Architecture Blueprint (Final)

## 1. Core Concept & Product Strategy

**Adaptle** is a mobile-first, Wordle-style daily book-to-movie trivia game paired with an organic personal reading tracker (**`To be read`**, **`Reading`**, and **`Finished`**). Instead of confronting new players with an empty shelf or copyrighted book summaries, users immediately play a **5-round daily story-premise challenge** plus a **Round 6 Common Thread Bonus**—building their reading list and streaming watchlist one tap at a time from every reveal card.

### Key Differentiators

- **Game-First Organic Library:** Solves the cold-start problem by letting users discover books through daily gameplay and save them directly from reveal cards.
- **3-Tier Progressive Hint Ladder:** Turns blind guesses into deduction with a risk-reward **15-point daily scoring system** (plus a **+3-point Common Thread Bonus** for an **18-point daily max**).
- **100% Copyright-Safe Factual Architecture:** Uses **Wikidata + Open Library (CC0 Public Domain)** for book facts, **auto-generated typographic book covers** (zero publisher artwork), and **offline-seeded original micro-hints**—eliminating recurring licensing fees and German/EU copyright friction.

---

## 2. Recommended Tech Stack & Offline AI Architecture

### Frontend: React Native + Expo (TypeScript)

- **Framework:** **Expo (Managed Workflow + Expo Router)** with **TypeScript** for cross-platform iOS, Android, and Web builds plus Over-The-Air (OTA) updates.
- **Auto-Generated Covers & Visual Share Cards:** `react-native-svg` + `expo-linear-gradient` to render crisp 2:3 typographic book covers in code; `react-native-view-shot` + `expo-sharing` to generate shareable daily score cards.
- **Offline Caching & Local State:** **TanStack Query (React Query)** + **MMKV** (`AsyncStorage`) so today's puzzle loads instantaneously and works offline on commutes.
- **Barcode Scanner (Manual Shelf Additions):** `expo-camera` for ISBN barcode scanning when users tap **`+ Add Book`** inside `My Library`.

### Backend: Supabase (EU Region — Frankfurt `eu-central-1`)

- **Database:** **Supabase PostgreSQL** hosted in **Frankfurt (`eu-central-1`)** for low European latency and clean GDPR alignment.
- **Authentication:** **Supabase Auth** with **Anonymous Sign-In** enabled at launch so users can play immediately without registering, then link Apple/Google Sign-In later to sync streaks and shelves.
- **Daily Puzzle Scheduler:** **Supabase `pg_cron`** to publish the next 6-round daily puzzle automatically at midnight CET/UTC.
- **Edge Functions (Deno / TypeScript):** Securely proxies **TMDB** and **Open Library** lookups so API keys stay hidden from the client bundle.

### AI Strategy: Option B — One-Time Offline LLM Seeding (Zero Live AI Costs)

- **No Live LLM in Production:** Users never trigger live AI calls while playing, keeping runtime inference costs at **\$0/month** with zero latency.
- **One-Time Offline Seeding:** Run a lightweight model (**Gemini 2.5 Flash-Lite** or **GPT-6 Luna**) locally on your computer once when building your initial 250–500 puzzles to generate `setting_hint`, `character_hint`, and `common_thread_pairs` (**< \$0.35 total one-time cost**), then store them permanently in Supabase.

---

## 3. Copyright-Safe Book Sources & Typographic Covers

### Official Book Metadata Sources (100% CC0 Public Domain)

1. **Wikidata (Primary Adaptation Linker — CC0):**
   - Uses structured property **`P144` ("based on")** alongside book ISBN (`P212`), author (`P50`), and movie TMDB ID (`P4947`) via free SPARQL queries to pull verified book-to-movie pairs under **CC0 Public Domain**.
2. **Open Library (Primary Bibliographic Catalog — CC0):**
   - Pulls strictly factual metadata (`isbn_13`, `title`, `authors`, `publish_date`, `number_of_pages`, `subjects`, edition count, reading-log count, rating count, and average rating) from Open Library's **CC0** dumps/API for puzzle seeding and manual `+ Add Book` searches.
   - Manual searches check the internal `catalog_items` table first and fall back to Open Library, then Google Books. The **Popular only** option uses Open Library work-level activity as a popularity signal.
   - **Strict Exclusion:** Ignore Open Library's `description` field and external cover URLs.
3. **Google Books API (Factual Fallback Only):**
   - Used only if a user scans a rare ISBN not present in Open Library, extracting strictly `title`, `authors`, `pageCount`, and `categories` (ignoring `description` and `imageLinks`).

### Auto-Generated Typographic Book Covers

### Popular search ranking

The optional **Popular only** filter ranks relevant Open Library results with a logarithmic score so books with very large reading logs do not dominate the result set:

```text
reading = log10(1 + readinglog_count)
ratings = log10(1 + ratings_count)
editions = log10(1 + edition_count)

score = 0.60 × reading + 0.25 × ratings + 0.15 × editions
score *= 0.90 + 0.10 × (ratings_average / 5) × min(ratings_count / 100, 1)
```

A result must have at least 1,000 reading-log entries, 50 ratings, and 5 editions. After these minimums, only the top 25% of qualifying, search-relevant results are returned (at least one when any result qualifies). Search relevance remains the first gate. `catalog_items` matches are enriched with the equivalent Open Library work metrics before this filter is applied.

These fields are factual aggregate metadata. They are returned only for search ranking and are not persisted to the user's library. Google Books title results do not qualify for **Popular only**, because that source does not expose the same readership signal.

### Book search cache

Normalized `booksearch-proxy` responses are cached server-side in Supabase and are never readable by client roles:

- title/author searches and adaptation lookups: 24 hours
- **Popular only** searches: 6 hours
- ISBN lookups: 7 days
- successful empty results: 5 minutes
- failed requests: not cached, so the next attempt can recover immediately

The cache key includes the normalized query/action, both search filters, and a schema version. Expired rows are ignored and cleaned opportunistically. Only factual normalized book metadata is cached; descriptions and cover URLs remain excluded.

To eliminate publisher cover copyright risk and broken external image URLs, every book cover is rendered dynamically in React Native SVG using uncopyrightable facts (**Title**, **Author**, and **Genre Theme**):

| Theme ID (`cover_theme`)  | Target Genres                     | Visual Palette & Motif                                |
| :------------------------ | :-------------------------------- | :---------------------------------------------------- |
| **`scifi_teal`**          | Sci-Fi, Cyberpunk, Space          | Deep Teal & Amber gradient with orbital ring geometry |
| **`thriller_navy`**       | Mystery, Crime, Suspense          | Midnight Navy & Gold gradient with sharp grid lines   |
| **`fantasy_plum`**        | Fantasy, Magical Realism          | Royal Plum & Silver gradient with crescent/star motif |
| **`literary_terracotta`** | Literary Fiction, Drama, Classics | Warm Terracotta & Cream with minimalist frame border  |
| **`romance_rose`**        | Romance, Contemporary             | Dusty Rose & Warm Sand with soft overlapping circles  |
| **`nonfiction_forest`**   | Biography, History, Psychology    | Forest Green & Sage with structured editorial stripes |

_(Note: Official **TMDB Movie Posters** are displayed on the Reveal Card and in Movie Common Thread rounds, as permitted under TMDB's API Terms with attribution.)_

---

## 4. Daily Gameplay Loop, Hints & Scoring

### Part 1: 5-Round Book-to-Movie Premise Match (15 Points Max)

1. **The Prompt:** Displays the **Auto-Generated Typographic Cover** and the TMDB adaptation poster side by side, identifies each work once, and asks the player to select its correct one-line story premise from **3 shuffled choices**. The same mode powers library adaptation practice.
2. **The 3-Tier Progressive Hint Ladder:**
   - **Start (0 Hints Used):** **3 Points** potential.
   - **Hint 1 — Setting:** Drops round potential to **2 Points** (e.g., _"Dystopian 2019 Los Angeles"_).
   - **Hint 2 — Character Roles:** Drops round potential to **1 Point** (e.g., _"A weary detective and an experimental android"_).
   - **Hint 3 — Premise Keywords:** Stays at **1 Point** as a final rescue clue (e.g., _"humanity · engineered fugitives"_).
   - **Wrong Guess:** **0 Points** (still displays the Reveal Card).
3. **The Reveal Card:** Displays the correct premise, the movie poster, release year, director, cast, longer story premise, and streaming providers (via TMDB), plus 1-tap shelf buttons (**`To be read`**, **`Reading`**, **`Finished`**).

### Part 2: Round 6 — Common Thread Bonus (+3 Points Max)

After Round 5, players unlock a side-by-side bonus round (**18-point daily max**) supporting three rotating formats:

- **`BOOK_PAIR`:** Two auto-generated typographic book covers side by side.
- **`MOVIE_PAIR`:** Two TMDB movie posters side by side.
- **`CROSSOVER`:** One typographic book cover paired with one TMDB movie poster.

Players choose what both works share out of **3 choices** across `The Setting`, `The Plot`, `The Characters`, `The Director`, or `The Author` (**+3 pts** for correct match, **0 pts** for wrong guess), followed by 1-tap shelf save buttons for both items.

---

## 5. UI Wireframes (2-Tab Architecture)

### Tab 1: `Play` — State A (Active Question + Progressive Hint Ladder)

Before entering the daily game, Adaptle shows a concise once-per-day landing state:

```text
Welcome to Adaptle / Welcome back

5 adaptations. 1 common thread. 18 points to play for.

Identify each book-to-screen story from its one-line premise,
unlock clues when needed, then find the bonus connection.

[ Play today's puzzle ]
```

If the user already completed the day, the landing instead shows the completed
score and streak with a "View today's results" action. The current puzzle date
is stored locally so the landing is not repeated after every tab switch or app
refresh on the same day.

```text
┌─────────────────────────────────────────────────────┐
│  ADAPTLE #14          ● ● ○ ○ ○  (Round 2/5)   🔥 7 │
│  Current Round Potential: [ 2 PTS ] (1 Hint Used)   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  SOURCE BOOK                 SCREEN ADAPTATION      │
│  ┌───────────┐               ┌───────────┐          │
│  │ GENERATED │               │ TMDB      │          │
│  │ COVER     │               │ POSTER    │          │
│  └───────────┘               └───────────┘          │
│       (identity shown once for each work)           │
│                                                     │
│  WHAT IS THE STORY'S ONE-LINE PREMISE?             │
│                                                     │
├─────────────────────────────────────────────────────┤
│  NEED A CLUE? (Tap to unlock next hint)             │
│                                                     │
│  ✅ HINT 1: Dystopian 2019 Los Angeles              │
│  🔓 [ Unlock Hint 2: Character Roles (-1 pt) ]     │
│  🔒 Hint 3: Premise Keywords (Locked)                │
│                                                     │
├─────────────────────────────────────────────────────┤
│  SELECT THE STORY PREMISE:                          │
│  ┌───────────────────────────────────────────────┐  │
│  │  A   A weary hunter questions humanity…        │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  B   A young heir fights for a desert world…   │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  C   A stranded astronaut improvises…          │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
├─────────────────────────────────────────────────────┤
│        [ 🎮 Play ]             [ 📚 My Library ]    │
└─────────────────────────────────────────────────────┘
```

### Tab 1: `Play` — State B (The Reveal Card + 1-Tap Shelf Save)

```text
┌─────────────────────────────────────────────────────┐
│  ADAPTLE #14          ● ● ○ ○ ○  (Round 2/5)   🔥 7 │
├─────────────────────────────────────────────────────┤
│  ✅ CORRECT!  +2 PTS (1 Hint Used)                  │
│                                                     │
│  ┌──────────┐  THE ADAPTATION:                      │
│  │  MOVIE   │  Blade Runner (1982)                  │
│  │  POSTER  │  Dir. Ridley Scott                    │
│  │  (TMDB)  │  Cast: Harrison Ford, Sean Young      │
│  └──────────┘  📺 Stream: Netflix, Prime Video      │
│                                                     │
├─────────────────────────────────────────────────────┤
│  SAVE THIS BOOK TO YOUR LIBRARY:                    │
│                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ 📖 To be read│ │ 📚 Reading   │ │ ✅ Finished   │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────┐  │
│  │              NEXT ROUND (3/5) →               │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│        [ 🎮 Play ]             [ 📚 My Library ]    │
└─────────────────────────────────────────────────────┘
```

### Tab 1: `Play` — State C (Round 6: Common Thread Bonus)

```text
┌─────────────────────────────────────────────────────┐
│  ADAPTLE #14 • BONUS ROUND (6/6)             +3 PTS │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ┌───────────────┐           ┌───────────────┐     │
│   │  TYPOGRAPHIC  │           │  TYPOGRAPHIC  │     │
│   │     DUNE      │     ⚡    │  THE MARTIAN  │     │
│   │ Frank Herbert │           │   Andy Weir   │     │
│   └───────────────┘           └───────────────┘     │
│                                                     │
│  WHAT DO THESE TWO WORKS HAVE IN COMMON?            │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  A   The Setting  (Hostile desert worlds)     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  B   The Author   (Same writer)               │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  C   The Plot     (Time-loop mystery)         │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
├─────────────────────────────────────────────────────┤
│        [ 🎮 Play ]             [ 📚 My Library ]    │
└─────────────────────────────────────────────────────┘
```

### Tab 1: `Play` — State D (18-Point Daily Summary & Viral Share Card)

```text
┌─────────────────────────────────────────────────────┐
│  ADAPTLE #14 COMPLETE!                              │
│                                                     │
│          🏆  15 / 18 PTS   |   🔥 7-DAY STREAK      │
│                                                     │
│  ROUND BREAKDOWN:                                   │
│  Round 1: 🟨 3 pts (No hints)                       │
│  Round 2: ⬜ 2 pts (1 hint)                         │
│  Round 3: 🟫 1 pt  (3 hints)                        │
│  Round 4: 🟨 3 pts (No hints)                       │
│  Round 5: 🟨 3 pts (No hints)                       │
│  Bonus 6: ⭐ 3 pts (Common Thread)                  │
│                                                     │
│  📚 2 books added to your library today!            │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │         📤 SHARE DAILY SCORE CARD             │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │         📚 VIEW MY SAVED LIBRARY              │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Shareable Score Text:**

```text
Adaptle #14 — 15/18 pts 🎬📖 (🔥 7)
🟨 ⬜ 🟫 🟨 🟨 ⭐
Saved 2 books to my shelf!
```

### Tab 2: `My Library` — Active Shelf View

```text
┌─────────────────────────────────────────────────────┐
│  MY LIBRARY                         [ + Add Book ]  │
│  14 Books Saved  •  9 Screen Adaptations            │
├─────────────────────────────────────────────────────┤
│  ┌───────────────┐ ┌───────────────┐ ┌────────────┐ │
│  │📖 To be read 8│ │ 📚 Reading 2 │ │ ✅ Finished 4 │ │
│  └───────────────┘ └───────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────┤
│  🔍 Search my shelf...   [ All books | Adaptations ]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ ┌───────┐  Do Androids Dream of Electric      │  │
│  │ │ TYPO  │  Sheep?                             │  │
│  │ │ COVER │  Philip K. Dick                     │  │
│  │ └───────┘  🎬 Movie: Blade Runner (1982)      │  │
│  │            📺 Stream: Netflix, Prime Video    │  │
│  │  ───────────────────────────────────────────  │  │
│  │  Status: [📖 To be read ▾]   [ 🎬 Film Info ] │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ ┌───────┐  Atomic Habits                      │  │
│  │ │ TYPO  │  James Clear                        │  │
│  │ │ COVER │  (Added manually • No adaptation)   │  │
│  │ └───────┘                                     │  │
│  │  ───────────────────────────────────────────  │  │
│  │  Status: [📖 To be read ▾]                    │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
├─────────────────────────────────────────────────────┤
│        [ 🎮 Play ]             [ 📚 My Library ]    │
└─────────────────────────────────────────────────────┘
```

### Tab 2: `My Library` — Empty Shelf Onboarding State

```text
┌─────────────────────────────────────────────────────┐
│  MY LIBRARY                         [ + Add Book ]  │
├─────────────────────────────────────────────────────┤
│  ┌───────────────┐ ┌───────────────┐ ┌────────────┐ │
│  │📖 To be read 0│ │ 📚 Reading 0 │ │ ✅ Finished 0 │ │
│  └───────────────┘ └───────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────┤
│                     📚  +  🎬                       │
│            Your Reading Shelf Is Empty              │
│    Play today's Adaptle puzzle to discover great    │
│    books and their screen adaptations—then save     │
│    your favorites here with one tap.                │
│  ┌───────────────────────────────────────────────┐  │
│  │           🎮 PLAY TODAY'S PUZZLE              │  │
│  └───────────────────────────────────────────────┘  │
│              or Search / Scan a Book                │
├─────────────────────────────────────────────────────┤
│        [ 🎮 Play ]             [ 📚 My Library ]    │
└─────────────────────────────────────────────────────┘
```

---

## 6. Supabase PostgreSQL Database Schema (4 Tables)

1. **`catalog_items`**
   - `isbn13` (TEXT, PK)
   - `book_title` (TEXT, NOT NULL)
   - `author` (TEXT, NOT NULL)
   - `genre` (TEXT)
   - `cover_theme` (TEXT, NOT NULL)
   - `metadata_source` (TEXT, DEFAULT `'wikidata_openlibrary'`)
   - `tmdb_id` (INTEGER, NULLABLE — null for manually added books without adaptations)
   - `movie_title` (TEXT, NULLABLE)
   - `release_year` (INTEGER, NULLABLE)
   - `director` (TEXT, NULLABLE)
   - `movie_poster_path` (TEXT, NULLABLE)
   - `lead_characters` (JSONB — e.g., `["Rick Deckard", "Rachael"]`)
   - `setting_hint` (TEXT — Hint 1)
   - `character_hint` (TEXT — Hint 2)
   - `premise_short` (TEXT — correct one-line answer, maximum 70 characters)
   - `premise_decoys` (TEXT[] — exactly two distinct tailored false premises)
   - `premise_keywords` (TEXT[] — final-hint keywords)
   - `scheduled_date` (DATE, NULLABLE)

2. **`common_thread_pairs`**
   - `id` (UUID, PK)
   - `pair_mode` (TEXT — `'BOOK_PAIR'`, `'MOVIE_PAIR'`, or `'CROSSOVER'`)
   - `item_a_isbn13` (TEXT, FK -> `catalog_items.isbn13`)
   - `item_b_isbn13` (TEXT, FK -> `catalog_items.isbn13`)
   - `connection_category` (TEXT — `'The Setting'`, `'The Plot'`, `'The Characters'`, `'The Director'`, `'The Author'`)
   - `connection_detail` (TEXT — e.g., `"Hostile desert worlds"`)
   - `decoy_1_category` (TEXT) & `decoy_1_detail` (TEXT)
   - `decoy_2_category` (TEXT) & `decoy_2_detail` (TEXT)
   - `scheduled_date` (DATE, UNIQUE)

3. **`user_library`**
   - `id` (UUID, PK)
   - `user_id` (UUID, FK -> `auth.users`)
   - `isbn13` (TEXT, FK -> `catalog_items.isbn13`)
   - `status` (TEXT — `'TO_BE_READ'`, `'READING'`, or `'FINISHED'`)
   - `saved_at` (TIMESTAMPTZ, DEFAULT `now()`)
   - _Unique Constraint:_ `(user_id, isbn13)`

4. **`daily_scores`**
   - `id` (UUID, PK)
   - `user_id` (UUID, FK -> `auth.users`)
   - `puzzle_date` (DATE, NOT NULL)
   - `total_points` (INTEGER, 0–18)
   - `round_breakdown` (JSONB — e.g., `[3, 2, 1, 3, 3, 3]`)
   - `completed_at` (TIMESTAMPTZ, DEFAULT `now()`)
   - _Unique Constraint:_ `(user_id, puzzle_date)`

---

## 7. Offline Seeding Prompts (Run Locally Once)

### Prompt A: Generate premise choices and hints (`seed_puzzle_hints.txt`)

_Input strictly factual Book Title + Author from Wikidata/Open Library—never pass TMDB text into an LLM._

```text
You are creating factual, spoiler-free trivia hints for the book "{{book_title}}" by {{author_name}} and its screen adaptation.

Generate original, spoiler-free puzzle content:
1. story_premise: A 14-to-24-word central premise.
2. setting_hint: A 4-to-8-word factual when/where description.
3. character_hint: A 6-to-12-word factual description of the lead roles.
4. premise_short: The correct one-line answer, at most 70 characters.
5. premise_decoys: Exactly two false premises, each at most 70 characters, plausible for the same book and genre and comparable to the correct answer in length, structure, and specificity.
6. premise_keywords: Two to four spoiler-free words or phrases from the correct premise.

STRICT RULES:
- Use completely original, neutral wording—never copy publisher blurbs or movie synopses.
- Keep every field strictly spoiler-free and exclude titles, creator names, character names, outcomes, twists, and endings.
- Make the decoys genuinely false by changing the central conflict, role, setting, or objective; never borrow an unrelated book's premise.
- Return three distinct premise labels.

After generation, a strict second-pass editor reviews the decoys for semantic
equivalence with the correct premise, unrelated story drift, spoilers, and
unlike-length wording. Only the reviewed pair is eligible for upload.
```

### Prompt B: Generate Round 6 Common Thread Pairs (`seed_common_thread.txt`)

```text
Given two works ({{pair_mode}}: BOOK_PAIR, MOVIE_PAIR, or CROSSOVER):
Item A: "{{item_a_title}}" ({{item_a_creator_and_year}})
Item B: "{{item_b_title}}" ({{item_b_creator_and_year}})

Identify ONE genuine, spoiler-free commonality they share from these categories:
"The Setting", "The Plot", "The Characters", "The Director", or "The Author".

Provide:
1. connection_category: The matching category name.
2. connection_detail: A 3-to-6-word factual summary of the shared trait (e.g., "Hostile desert worlds" or "Directed by Denis Villeneuve").
3. Two plausible but FALSE decoy pairs (category + 3-to-6-word detail) that do NOT apply to both works.

STRICT RULES:
- Use completely original, factual phrasing—never copy publisher blurbs or TMDB movie overviews.
- Keep all details strictly spoiler-free.
```

---

## 8. Compliance & Phased Roadmap

### Legal & API Compliance

- **Book Data (100% CC0):** Sourced strictly from **Wikidata (`P144` / `P212`)** and **Open Library** CC0 datasets; zero publisher blurbs or copyrighted book covers stored.
- **TMDB Rules:** TMDB text fields are never passed into LLM prompts; movie posters and streaming providers include TMDB attribution; commercial TMDB license (`sales@themoviedb.org`) is activated prior to enabling paid subscriptions or ads.

### Launch Phases

1. **Phase 1 (MVP Launch):** Run the offline seeding script using **Wikidata SPARQL + Open Library (CC0) + TMDB + Gemini Flash-Lite** to populate 250 puzzles + 50 Common Thread pairs; launch the 2-tab React Native + Expo app on Supabase Frankfurt (`eu-central-1`).
2. **Phase 2 (Retention & Polish):** Add daily push notifications, Reader DNA attribute bars (computed from saved book genres), account linking that preserves the anonymous user's library, scores, and streak, and a **“Why read it?”** feature with three factual editorial reasons plus up to three private user reasons per saved book.
3. **Phase 3 (Monetization):** Activate TMDB commercial license and launch **Adaptle Plus** (unlimited archive puzzles, streaming release alerts for `To be read` books, and optional V2 "What Would I Do" AI playbooks).

### Why Read It? — Phase 2

- Show three short, factual, spoiler-free **editorial reasons** on seeded book reveal/library cards.
- Generate editorial reasons once during offline seeding; no live AI calls are triggered by users.
- Let each user add, edit, and remove up to **three private personal reasons** for each saved book.
- Store editorial reasons on `catalog_items` and personal reasons on `user_library`.
- Support offline optimistic edits through MMKV and the existing mutation queue.
- Include the new personal reason text in the privacy policy and deletion/export handling.

### Archive Replay — Phase 2

- Add a **“Play another Adaptle”** action after daily completion to play a past puzzle.
- Archive plays use separate replay history and must never delete or replace today's daily result.
- Archived puzzles do not increase today's score or streak.
- Keep today's completed puzzle single-play in production; `Replay today (development)` remains a QA-only control.

### Branching Strategy After Phase 1

Once Phase 1 is live, production must be isolated from ongoing Phase 2 development.

#### Git

- Protect `main` as the production/release branch.
- Develop each Phase 2 feature in a `feature/*` branch.
- Merge through pull requests after automated and staging validation.
- Add a `develop` integration branch if multiple large features need to land together.
- Never rewrite production history or commit directly to `main` after launch.

#### Supabase

- Use a separate Supabase preview branch or staging project for Phase 2 work.
- Never test migrations directly against production.
- Add one new forward-only migration per schema change; do not edit migrations already applied to production.
- Validate migrations, RLS, functions, and seeded data in staging before deployment.
- Preserve backward compatibility because old and new app versions overlap during rollout.

#### EAS Environments

- `development`: developer tooling and development Supabase.
- `preview`: staging Supabase and pre-release QA.
- `production`: live Supabase and store/release builds.

Build profiles and Expo Update channels must match their intended environment so Phase 2 code cannot accidentally receive production configuration.

#### Compatibility & Feature Flags

- Add optional columns, tables, and endpoints before making the client depend on them.
- Keep existing endpoints working during staged rollouts.
- Avoid destructive schema, RLS, or data changes.
- Gate unfinished Phase 2 behavior behind remote or local feature flags.
- Take a database backup or export before production content/schedule changes.
