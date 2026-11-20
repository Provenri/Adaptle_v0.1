# Phase 1 Remaining Plan

## 1. Configure Supabase

Required: project reference, Supabase URL, anon key, access token, and TMDB API key.

- Link the local Supabase project.
- Apply the database migration.
- Enable anonymous authentication.
- Deploy `booksearch-proxy` and `tmdb-proxy`.
- Set the TMDB secret.
- Verify RLS and anonymous access.

**Done when:** Anonymous users can read today's puzzle and access only their own library and scores.

## 2. Run the Content Pipeline

Required: TMDB key, OpenAI key, Supabase URL, and service-role key.

Run incrementally:

1. `fetch-wikidata`
2. `enrich-openlibrary`
3. `enrich-tmdb`
4. `generate-hints`
5. `generate-threads`
6. `schedule-upload`

Run first with `--limit 10`, inspect the checkpoints, and then run the full initial catalog.

**Done when:** At least 10 validated development puzzles work, followed by 250 puzzles and 50 bonus pairs.

## 3. Connect the Daily Puzzle API

- Replace the demo puzzle provider with a Supabase daily-puzzle query.
- Load today's five catalog items.
- Load today's common-thread pair.
- Deterministically shuffle answer choices.
- Cache the puzzle through TanStack Query for offline play.
- Handle missing, expired, and already-completed puzzles.

**Done when:** The Play tab uses Supabase content online and cached content offline.

## 4. Connect the Production Library API

- Load the authenticated user's `user_library`.
- Join catalog metadata.
- Replace demo shelf records.
- Send search and ISBN requests to `booksearch-proxy`.
- Resolve barcode scanner results through the ISBN endpoint.
- Insert manual catalog items and shelf rows.
- Sync optimistic changes through the existing offline queue.

**Done when:** Search, scan, save, status changes, refresh, reconnection, and app restart use real data.

## 5. Connect Movie Data

- Fetch movie details and watch providers through `tmdb-proxy`.
- Cache provider data for offline display.
- Keep TMDB attribution visible.
- Continue excluding TMDB overview prose and other copyrighted descriptive text.

**Done when:** Reveal and library cards display production TMDB metadata.

## 6. Production State Cleanup

- Remove demo puzzle, library, and candidate fixtures from runtime defaults.
- Add loading, empty, offline, and backend-error states.
- Prevent duplicate score writes and library mutations.
- Verify anonymous-session restoration across app restarts.
- Add a restore state for a puzzle completed earlier today.

**Done when:** No user flow depends on demo data.

## 7. Device QA

Test on a physical Android device through Expo Go:

- Complete all six rounds.
- Use all three hints.
- Test correct and incorrect answers.
- Save books to each shelf.
- Search for a book and scan an ISBN barcode.
- Kill and reopen the app.
- Play offline and reconnect to verify queued synchronization.
- Share the score card.
- Verify the streak rollover around Europe/Berlin midnight.

## 8. Release Validation

- Rerun all unit and integration tests.
- Run production Android and Web exports.
- Run an iOS export if the release target includes iOS.
- Verify no secrets are embedded in the client.
- Back up the database and seeded content.
- Build the release package.
- Document launch and rollback steps.

## Recommended Execution Order

1. Supabase deployment.
2. Small seeded-content trial.
3. Daily puzzle connection.
4. Library and TMDB connection.
5. Full content seeding.
6. Demo-fixture removal.
7. Physical-device QA.
8. Release build.

The first blocker is Supabase and credential configuration; the remaining Phase 1 work can then be completed end-to-end.

## Current completion checkpoint

- Supabase project linked and migrations verified.
- Edge Functions deployed and smoke-tested.
- Production daily puzzle, Library, and TMDB provider data connected.
- Expo EAS project linked as `@provenri/adaptle`.
- Android development build completed and passed physical-device QA.
- Today's common-thread bonus inserted and verified.
- Actor-based questions and the requested hint ladder tested.
- Automated app, seeding, Edge Function, Android export, and Web export checks pass.
- Remaining: final production EAS build, production-artifact device smoke test, and release.
