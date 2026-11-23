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
- Every published main-round item has `premise_short`, exactly two distinct plausible `premise_decoys`, at least two `premise_keywords`, `setting_hint`, and `character_hint`; run the premise-puzzle backfill before release if any are missing.
- Sample the daily and library-practice choices across several genres and verify all three premises are similarly specific, close in length/style, and not obvious cross-genre outliers.
- Confirm the second-pass decoy review has no known synonymous-answer cases in today's five rounds; reject and regenerate any ambiguous pair before release.
- Today's `common_thread_pairs` row exists and references published books.
- Anonymous authentication is enabled.
- `booksearch-proxy` and `tmdb-proxy` are active.
- RLS still limits personal tables to the authenticated user.
- The development-only replay control is absent from production behavior.
- No service-role, OpenAI, or TMDB key is in the client bundle.
- Do not publish `/impressum` until real operator name, serviceable postal address, email, direct contact route, and applicable entity/editorial details are configured. The placeholder warning must be absent in release.
- Contact notifications require server-side `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, and `CONTACT_TO_EMAIL`; verify the sender domain and perform a real submission.
- Verify anonymous users cannot read or write `contact_requests` directly.

## Production build

The EAS production environment must contain only:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Optional `EXPO_PUBLIC_IMPRESSUM_OPERATOR_NAME`
- Optional `EXPO_PUBLIC_IMPRESSUM_POSTAL_ADDRESS`
- Optional `EXPO_PUBLIC_IMPRESSUM_EMAIL`
- Optional `EXPO_PUBLIC_IMPRESSUM_DIRECT_CONTACT`
- Optional `EXPO_PUBLIC_IMPRESSUM_ENTITY_DETAILS`
- Optional `EXPO_PUBLIC_IMPRESSUM_RESPONSIBLE_PERSON`

## Public privacy policy

- Production policy URL: `https://adaptle.expo.app/privacy`
- Hosted through Expo Router Web on EAS Hosting.
- The `/privacy` route is standalone and must not render inside the Play/My Library tab navigator.
- Before Play Console submission, verify the URL returns HTTP 200, stays on `/privacy` after hydration, and displays `adaptle.privacy@gmail.com`.
- Redeploy after policy-content changes:

```bash
cd app
npx expo export --platform web --output-dir dist --clear
npx eas-cli@latest deploy --prod --environment production --dev-domain adaptle --non-interactive
```

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

For an iOS Simulator-only build, which does not require device provisioning:

```bash
cd app
npx eas-cli@latest build --profile ios-simulator --platform ios
```

After the simulator build finishes, open its EAS build page, download the `.tar.gz`
artifact, extract it, and install the generated `.app` bundle into a booted
Simulator with:

```bash
xcrun simctl install booted /path/to/Adaptle.app
```

## Launch

1. Install and smoke-test the production artifact on a physical Android device.
2. Verify the anonymous sign-in succeeds.
3. Complete today's six-round flow.
   Confirm both the daily flow and library “Play adaptation” use premise selection, conceal the premise before answering, and show setting/character/keyword hints.
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
