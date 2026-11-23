import { z } from "zod";

import { readCheckpoint, writeCheckpoint } from "../lib/checkpoint.js";
import { requireEnv } from "../lib/env.js";
import { fetchJson } from "../lib/http.js";
import { createOpenAiClient, type LlmJsonClient } from "../lib/llm.js";
import { mapConcurrent } from "../lib/concurrency.js";

type ScheduleBook = {
  isbn13: string;
  book_title: string;
  author: string;
  genre: string | null;
  release_year: number | null;
};

type ScheduleThread = {
  id: string;
  pair_mode: "BOOK_PAIR" | "MOVIE_PAIR" | "CROSSOVER";
  item_a_isbn13: string;
  item_b_isbn13: string;
  connection_category: string;
  connection_detail: string;
  decoy_1_category: string;
  decoy_1_detail: string;
  decoy_2_category: string;
  decoy_2_detail: string;
};

type ScheduleDay = {
  date: string;
  recent: number;
  older: number;
  books: ScheduleBook[];
  thread: ScheduleThread | null;
};

type ScheduleReport = {
  applied: boolean;
  plan: {
    days: ScheduleDay[];
    leftover: ScheduleBook[];
  };
  [key: string]: unknown;
};

const categories = ["The Setting", "The Plot", "The Characters"] as const;

const ThreadSchema = z.object({
  item_a_isbn13: z.string(),
  item_b_isbn13: z.string(),
  connection_category: z.enum(categories),
  connection_detail: z.string().min(3).max(80),
  decoy_1_category: z.enum(categories),
  decoy_1_detail: z.string().min(3).max(80),
  decoy_2_category: z.enum(categories),
  decoy_2_detail: z.string().min(3).max(80),
});

const THREAD_JSON_SCHEMA = {
  type: "object",
  properties: {
    item_a_isbn13: { type: "string" },
    item_b_isbn13: { type: "string" },
    connection_category: { type: "string", enum: [...categories] },
    connection_detail: { type: "string" },
    decoy_1_category: { type: "string", enum: [...categories] },
    decoy_1_detail: { type: "string" },
    decoy_2_category: { type: "string", enum: [...categories] },
    decoy_2_detail: { type: "string" },
  },
  required: [
    "item_a_isbn13",
    "item_b_isbn13",
    "connection_category",
    "connection_detail",
    "decoy_1_category",
    "decoy_1_detail",
    "decoy_2_category",
    "decoy_2_detail",
  ],
  additionalProperties: false,
} as const;

export async function generateScheduleThreads(options: {
  limit?: number;
  client?: LlmJsonClient;
}): Promise<void> {
  const client = options.client ?? createOpenAiClient();
  const [report] = readCheckpoint(
    "10-hybrid-future-schedule",
    z.custom<ScheduleReport>((value) =>
      Boolean(value && typeof value === "object" && "plan" in value),
    ),
  );
  if (!report) throw new Error("No hybrid schedule report is available.");
  if (report.applied)
    throw new Error("Cannot regenerate threads after schedule apply.");
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const missingDays = report.plan.days
    .filter((day) => !day.thread)
    .slice(0, options.limit);
  const generated = await mapConcurrent(
    missingDays,
    8,
    async (day) => {
      const isbns = day.books.map((book) => book.isbn13);
      const details =
        (await fetchJson<
          Array<{
            isbn13: string;
            book_title: string;
            author: string;
            genre: string | null;
            setting_hint: string;
            character_hint: string;
            premise_short: string;
          }>
        >(
          `${baseUrl}/rest/v1/catalog_items?isbn13=in.(${isbns.join(
            ",",
          )})&select=isbn13,book_title,author,genre,setting_hint,character_hint,premise_short`,
          { headers },
        )) ?? [];
      const raw = await client.completeJson({
        system:
          "Choose a genuine spoiler-free Common Thread between exactly two of five books. " +
          "Only use supplied factual fields. Never invent a connection.",
        prompt: `For puzzle date ${day.date}, choose two books with the strongest genuine shared setting, plot structure, or character dynamic.

${details
  .map(
    (book) =>
      `ISBN ${book.isbn13}: "${book.book_title}" by ${book.author}. Genre: ${
        book.genre ?? "unknown"
      }. Setting: ${book.setting_hint}. Characters: ${book.character_hint}. Premise: ${
        book.premise_short
      }.`,
  )
  .join("\n\n")}

Return the two ISBNs plus one factual 3-to-6-word connection and two false decoy connections. Use distinct categories for the answer and both decoys.`,
        schemaName: "schedule_common_thread",
        jsonSchema: THREAD_JSON_SCHEMA as unknown as Record<string, unknown>,
      });
      const parsed = ThreadSchema.parse(raw);
      if (
        parsed.item_a_isbn13 === parsed.item_b_isbn13 ||
        !isbns.includes(parsed.item_a_isbn13) ||
        !isbns.includes(parsed.item_b_isbn13) ||
        new Set([
          parsed.connection_category,
          parsed.decoy_1_category,
          parsed.decoy_2_category,
        ]).size !== 3
      ) {
        throw new Error(`Invalid generated thread for ${day.date}`);
      }
      return {
        date: day.date,
        thread: {
          ...parsed,
          id: `generated-${day.date}`,
          pair_mode: "BOOK_PAIR" as const,
        },
      };
    },
    (completed, failed) => {
      if (completed % 10 === 0 || completed === missingDays.length) {
        console.log(
          `  ${completed}/${missingDays.length} thread days processed (${failed} failed)`,
        );
      }
    },
  );

  const generatedByDate = new Map(
    generated
      .filter((item) => item !== null)
      .map((item) => [item.date, item.thread]),
  );
  report.plan.days = report.plan.days.map((day) => ({
    ...day,
    thread: day.thread ?? generatedByDate.get(day.date) ?? null,
  }));
  const missing = report.plan.days.filter((day) => !day.thread);
  report.threadAssignments = report.plan.days.filter(
    (day) => day.thread,
  ).length;
  report.missingThreadDays = missing.map((day) => day.date);
  writeCheckpoint("10-hybrid-future-schedule", [report]);
  console.log(
    JSON.stringify(
      {
        requested: missingDays.length,
        generated: generatedByDate.size,
        remainingMissing: missing.map((day) => day.date),
      },
      null,
      2,
    ),
  );
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} schedule days still lack Common Threads.`,
    );
  }
}
