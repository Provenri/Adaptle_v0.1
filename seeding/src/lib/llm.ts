import { optionalEnv, requireEnv } from './env.js';
import { fetchJson } from './http.js';

/**
 * Minimal provider-agnostic LLM interface. Swapping providers (e.g. back to
 * Gemini) only requires a new factory in this file.
 */
export interface LlmJsonClient {
  /** Runs a prompt and returns schema-constrained JSON. */
  completeJson(options: {
    system: string;
    prompt: string;
    schemaName: string;
    jsonSchema: Record<string, unknown>;
  }): Promise<unknown>;
  readonly model: string;
}

interface OpenAiChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
}

export function createOpenAiClient(): LlmJsonClient {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const model = optionalEnv('OPENAI_MODEL', 'gpt-5-mini');

  return {
    model,
    async completeJson({ system, prompt, schemaName, jsonSchema }) {
      const response = await fetchJson<OpenAiChatResponse>(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: {
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: schemaName, strict: true, schema: jsonSchema },
            },
          },
          retries: 4,
          retryDelayMs: 3_000,
        }
      );

      const message = response?.choices?.[0]?.message;
      if (!message || message.refusal) {
        throw new Error(`LLM refused or returned no message: ${message?.refusal ?? 'empty'}`);
      }
      if (!message.content) throw new Error('LLM returned empty content.');
      return JSON.parse(message.content);
    },
  };
}
