import { z } from "zod";

import type { LlmJsonClient } from "../lib/llm.js";

const ReviewSchema = z.object({
  premise_decoys: z.array(z.string().min(8).max(70)).length(2),
});

export const PREMISE_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    premise_decoys: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
      description:
        "Exactly two final false premises, each at most 70 characters",
    },
  },
  required: ["premise_decoys"],
  additionalProperties: false,
} as const;

export function buildPremiseReviewPrompt(
  bookTitle: string,
  author: string,
  answer: string,
  decoys: readonly string[],
  settingHint?: string,
  characterHint?: string,
): string {
  return `Critically review two puzzle decoys for "${bookTitle}" by ${author}.

Correct premise:
"${answer}"

Candidate false premises:
1. "${decoys[0]}"
2. "${decoys[1]}"

${settingHint ? `Story setting clue: ${settingHint}\n` : ""}${characterHint ? `Character-role clue: ${characterHint}\n` : ""}
Return the final two false premises after correcting any problem.

Reject a decoy if it:
- could also be true of this book, even with different wording;
- is an alternate phrasing of the correct event, conflict, setting, or purpose;
- is so unrelated that genre or visible book identity makes it obvious;
- moves to a different story world or character-role structure;
- contains the title, creator or character names, a twist, or an ending.

A good decoy is plausible from the visible identity but materially changes the central
conflict, roles, setting, or objective. Keep each final line close to the answer's
length and sentence style, no longer than 70 characters, and distinct from the
answer and the other decoy. If a candidate is already good, preserve it.`;
}

export async function reviewPremiseDecoys(
  client: LlmJsonClient,
  bookTitle: string,
  author: string,
  answer: string,
  decoys: readonly string[],
  settingHint?: string,
  characterHint?: string,
): Promise<string[]> {
  const raw = await client.completeJson({
    system:
      "You are a strict puzzle editor. Eliminate decoys that are synonymous with the correct premise, " +
      "could also be true, or are implausibly unrelated. Preserve originality and spoiler safety.",
    prompt: buildPremiseReviewPrompt(
      bookTitle,
      author,
      answer,
      decoys,
      settingHint,
      characterHint,
    ),
    schemaName: "premise_decoy_review",
    jsonSchema: PREMISE_REVIEW_SCHEMA as unknown as Record<string, unknown>,
  });
  const reviewed = ReviewSchema.parse(raw).premise_decoys;
  const labels = [answer, ...reviewed].map(normalizePremise);
  if (new Set(labels).size !== 3) {
    throw new Error(`Reviewed decoys are duplicates for "${bookTitle}"`);
  }
  if (!reviewed.every((decoy) => hasComparableLength(answer, decoy))) {
    throw new Error(
      `Reviewed decoys have unlike answer length for "${bookTitle}"`,
    );
  }
  return reviewed;
}

export function hasComparableLength(answer: string, decoy: string): boolean {
  const ratio = decoy.length / answer.length;
  return ratio >= 0.6 && ratio <= 1.5;
}

function normalizePremise(value: string): string {
  return value.trim().toLocaleLowerCase();
}
