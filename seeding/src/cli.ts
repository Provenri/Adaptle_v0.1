import { parseArgs } from "node:util";

import { enrichOpenLibrary } from "./steps/enrich-openlibrary.js";
import { enrichTmdb } from "./steps/enrich-tmdb.js";
import { fetchWikidata } from "./steps/fetch-wikidata.js";
import { generateHints } from "./steps/generate-hints.js";
import { generateThreads } from "./steps/generate-threads.js";
import { scheduleAndUpload } from "./steps/schedule-upload.js";
import { backfillAdaptations } from "./steps/backfill-adaptations.js";
import { preparePopularCatalogBatch } from "./steps/popular-catalog-batch.js";
import { reshuffleSchedule } from "./steps/reshuffle-schedule.js";
import { rebalanceThreads } from "./steps/rebalance-threads.js";
import { backfillPremisePuzzles } from "./steps/backfill-story-premises.js";

const USAGE = `Adaptle seeding pipeline

Usage: npm run seed -- <step> [options]

Steps:
  fetch-wikidata        Query Wikidata for verified book-to-movie pairs (CC0)
  enrich-openlibrary    Add CC0 bibliographic facts + cover themes from Open Library
  enrich-tmdb           Add movie facts + lead characters from TMDB (needs TMDB_API_KEY)
  generate-hints        Generate setting/character hints via LLM (needs OPENAI_API_KEY)
  generate-threads      Generate Round 6 common-thread pairs via LLM (needs OPENAI_API_KEY)
  schedule-and-upload   Assign scheduled dates (5 books + 1 thread per day) and
                        upsert into Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
  backfill-adaptations  Resolve missing catalog adaptations; dry-run by default
  popular-catalog-batch Prepare new popular adapted books + premise content
                        (needs OPENAI_API_KEY); dry-run by default
  reshuffle-schedule    Rebalance book dates while preserving bonus eligibility
  rebalance-threads     Move bonuses to prioritize prior book exposure
  backfill-premise-puzzles Generate tailored premise answers, two decoys + keyword hints; dry-run by default

Options:
  --limit <n>           Max items to process (dev mode; default 500 for fetch-wikidata)
  --count <n>           generate-threads: number of pairs to produce (default 50)
  --start-date <date>   schedule-and-upload: first puzzle date YYYY-MM-DD (default: tomorrow CET)
  --all-languages       fetch-wikidata: include non-English-language books
  --apply               Apply verified metadata/imports
  --refresh-decoys      backfill-premise-puzzles: review and replace existing decoys
  --isbn <isbn13>       Restrict metadata backfill to one ISBN-13
  --dry-run             Preview schedule-and-upload without writing to Supabase
  --film-year-from <n>  popular-catalog-batch: minimum film release year
  --film-year-to <n>    popular-catalog-batch: maximum film release year
  --end-date <date>     reshuffle-schedule: final puzzle date YYYY-MM-DD
  --seed <text>          Deterministic reshuffle seed

Checkpoints are written to seeding/out/ and later steps read the previous
step's checkpoint, so each step is independently re-runnable.
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: "string" },
      count: { type: "string" },
      "start-date": { type: "string" },
      "all-languages": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "refresh-decoys": { type: "boolean", default: false },
      isbn: { type: "string" },
      "film-year-from": { type: "string" },
      "film-year-to": { type: "string" },
      "end-date": { type: "string" },
      seed: { type: "string" },
    },
  });

  const step = positionals[0];
  const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;
  if (values.limit && (!Number.isFinite(limit) || limit! <= 0)) {
    console.error("--limit must be a positive integer");
    process.exit(1);
  }
  const count = values.count ? Number.parseInt(values.count, 10) : undefined;
  if (values.count && (!Number.isFinite(count) || count! <= 0)) {
    console.error("--count must be a positive integer");
    process.exit(1);
  }
  const filmYearFrom = values["film-year-from"]
    ? Number.parseInt(values["film-year-from"], 10)
    : undefined;
  const filmYearTo = values["film-year-to"]
    ? Number.parseInt(values["film-year-to"], 10)
    : undefined;
  if (
    (filmYearFrom !== undefined &&
      (!Number.isInteger(filmYearFrom) || filmYearFrom < 1800)) ||
    (filmYearTo !== undefined &&
      (!Number.isInteger(filmYearTo) || filmYearTo < 1800)) ||
    (filmYearFrom !== undefined &&
      filmYearTo !== undefined &&
      filmYearFrom > filmYearTo)
  ) {
    console.error("--film-year-from/to must be valid ordered years");
    process.exit(1);
  }

  switch (step) {
    case "fetch-wikidata":
      await fetchWikidata({
        limit: limit ?? 500,
        englishOnly: !values["all-languages"],
      });
      break;
    case "enrich-openlibrary":
      await enrichOpenLibrary({ limit });
      break;
    case "enrich-tmdb":
      await enrichTmdb({ limit });
      break;
    case "generate-hints":
      await generateHints({ limit });
      break;
    case "generate-threads":
      await generateThreads({ count: count ?? 50 });
      break;
    case "schedule-and-upload":
      await scheduleAndUpload({
        startDate: values["start-date"],
        dryRun: values["dry-run"],
      });
      break;
    case "backfill-adaptations":
      await backfillAdaptations({ apply: values.apply, limit });
      break;
    case "popular-catalog-batch":
      await preparePopularCatalogBatch({
        apply: values.apply,
        limit: limit ?? 50,
        filmYearFrom,
        filmYearTo,
      });
      break;
    case "reshuffle-schedule":
      if (!values["start-date"] || !values["end-date"]) {
        throw new Error(
          "reshuffle-schedule requires --start-date and --end-date",
        );
      }
      await reshuffleSchedule({
        startDate: values["start-date"],
        endDate: values["end-date"],
        seed: values.seed ?? "adaptle",
        apply: values.apply,
      });
      break;
    case "rebalance-threads":
      if (!values["start-date"] || !values["end-date"]) {
        throw new Error(
          "rebalance-threads requires --start-date and --end-date",
        );
      }
      await rebalanceThreads({
        startDate: values["start-date"],
        endDate: values["end-date"],
        apply: values.apply,
      });
      break;
    case "backfill-premise-puzzles":
    case "backfill-story-premises":
      await backfillPremisePuzzles({
        limit,
        apply: values.apply,
        refreshDecoys: values["refresh-decoys"],
        isbn13: values.isbn,
      });
      break;
    default:
      console.log(USAGE);
      process.exit(step ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
