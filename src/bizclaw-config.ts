/**
 * BizClaw secret keys and config helpers for the host process.
 * Isolated here so upstream changes to container-runner.ts don't conflict.
 *
 * These secret names are passed to readEnvFile() in container-runner.ts
 * to be forwarded to containers via stdin (never written to disk).
 */

export const BIZCLAW_SECRET_KEYS = [
  'OPENROUTER_API_KEY',
  'OPENROUTER_DEFAULT_MODEL',
  'TAVILY_API_KEY',
  'TMDB_API_KEY',
  'LM_STUDIO_BASE_URL',
] as const;
