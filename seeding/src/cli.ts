import { parseArgs } from 'node:util';

import { enrichOpenLibrary } from './steps/enrich-openlibrary.js';
import { enrichTmdb } from './steps/enrich-tmdb.js';
import { fetchWikidata } from './steps/fetch-wikidata.js';
import { generateHints } from './steps/generate-hints.js';
import { generateThreads } from './steps/generate-threads.js';
import { scheduleAndUpload } from './steps/schedule-upload.js';

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

Options:
  --limit <n>           Max items to process (dev mode; default 500 for fetch-wikidata)
  --count <n>           generate-threads: number of pairs to produce (default 50)
  --start-date <date>   schedule-and-upload: first puzzle date YYYY-MM-DD (default: tomorrow CET)
  --all-languages       fetch-wikidata: include non-English-language books

Checkpoints are written to seeding/out/ and later steps read the previous
step's checkpoint, so each step is independently re-runnable.
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: 'string' },
      count: { type: 'string' },
      'start-date': { type: 'string' },
      'all-languages': { type: 'boolean', default: false },
    },
  });

  const step = positionals[0];
  const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;
  if (values.limit && (!Number.isFinite(limit) || limit! <= 0)) {
    console.error('--limit must be a positive integer');
    process.exit(1);
  }
  const count = values.count ? Number.parseInt(values.count, 10) : undefined;
  if (values.count && (!Number.isFinite(count) || count! <= 0)) {
    console.error('--count must be a positive integer');
    process.exit(1);
  }

  switch (step) {
    case 'fetch-wikidata':
      await fetchWikidata({ limit: limit ?? 500, englishOnly: !values['all-languages'] });
      break;
    case 'enrich-openlibrary':
      await enrichOpenLibrary({ limit });
      break;
    case 'enrich-tmdb':
      await enrichTmdb({ limit });
      break;
    case 'generate-hints':
      await generateHints({ limit });
      break;
    case 'generate-threads':
      await generateThreads({ count: count ?? 50 });
      break;
    case 'schedule-and-upload':
      await scheduleAndUpload({ startDate: values['start-date'] });
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
