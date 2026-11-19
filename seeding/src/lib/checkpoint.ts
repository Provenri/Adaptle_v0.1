import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodType } from 'zod';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'out');

export function checkpointPath(name: string): string {
  return join(OUT_DIR, `${name}.json`);
}

export function writeCheckpoint(name: string, data: unknown): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = checkpointPath(name);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return path;
}

export function readCheckpoint<T>(name: string, schema: ZodType<T>): T[] {
  const path = checkpointPath(name);
  if (!existsSync(path)) {
    throw new Error(
      `Checkpoint "${name}" not found at ${path}. Run the previous pipeline step first.`
    );
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error(`Checkpoint "${name}" is not a JSON array.`);
  }
  return raw.map((item, i) => {
    const parsed = schema.safeParse(item);
    if (!parsed.success) {
      throw new Error(`Checkpoint "${name}" item ${i} failed validation: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}
