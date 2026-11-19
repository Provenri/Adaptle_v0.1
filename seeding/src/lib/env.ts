import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');

let loaded = false;

/** Loads seeding/.env once (if present) and returns a required variable. */
export function requireEnv(name: string): string {
  if (!loaded) {
    if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
    loaded = true;
  }
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to seeding/.env (see .env.example).`
    );
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  if (!loaded) {
    if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
    loaded = true;
  }
  return process.env[name] || fallback;
}
