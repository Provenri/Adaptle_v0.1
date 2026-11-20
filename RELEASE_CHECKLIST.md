# Phase 1 Release Checklist

## Required services

- Supabase project: `jjanptapcbijsdkdrvdy` (`eu-west-1`)
- Expo project: `@provenri/adaptle`
- Android application ID: `com.provenri.adaptle`
- iOS bundle ID: `com.provenri.adaptle`

## Preflight

Run from the repository root:

```bash
cd app
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
npx expo-doctor
cd ../seeding
npm test
npm run typecheck
cd ../supabase/functions
npx --yes deno test --allow-env
```

Verify:

- Today's puzzle has exactly five published `catalog_items`.
- Today's `common_thread_pairs` row exists and references published books.
- Anonymous authentication is enabled.
- `booksearch-proxy` and `tmdb-proxy` are active.
- RLS still limits personal tables to the authenticated user.
- The development-only replay control is absent from production behavior.
- No service-role, OpenAI, or TMDB key is in the client bundle.

## Production build

The EAS production environment must contain only:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Build Android:

```bash
cd app
npx eas-cli@latest build --profile production --platform android
```

Optional Web verification:

```bash
npx expo export --platform web --output-dir /tmp/adaptle-release-web --clear
```

Optional iOS build requires Apple credentials and an active Apple Developer account:

```bash
npx eas-cli@latest build --profile production --platform ios
```

## Launch

1. Install and smoke-test the production artifact on a physical Android device.
2. Verify the anonymous sign-in succeeds.
3. Complete today's six-round flow.
4. Test library search, ISBN scanning, status changes, offline sync, and sharing.
5. Confirm today's score and library data survive a full app restart.
6. Publish the production artifact only after those checks pass.
7. Monitor Supabase Auth, database logs, and Edge Function logs during launch.

## Rollback

- **Client failure:** stop the release rollout and republish the previous known-good EAS artifact.
- **Edge Function failure:** redeploy the previous function revision from Git.
- **Schema failure:** do not drop tables or reset production; prepare a new forward-fix migration.
- **Bad puzzle content:** correct the affected `catalog_items` or `common_thread_pairs` row while preserving IDs and scheduled dates.
- **Auth/sync failure:** retain client-side MMKV data and offline queue; fix the remote issue without clearing user storage.

## Content backup

The reproducible content source is the versioned seeding pipeline plus Supabase checkpoints. Before a major schedule upload:

1. Export the `catalog_items` and `common_thread_pairs` production tables.
2. Keep the corresponding seeding checkpoint manifest.
3. Upload incrementally and verify row counts and scheduled dates.
4. Never upload service-role credentials or local `.env` files.
