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
  // Movisvami — social publishing credentials
  'MOVISVAMI_META_APP_ID',
  'MOVISVAMI_META_APP_SECRET',
  'MOVISVAMI_META_PAGE_ACCESS_TOKEN',
  'MOVISVAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID',
  'MOVISVAMI_FACEBOOK_PAGE_ID',
  'MOVISVAMI_TWITTER_API_KEY',
  'MOVISVAMI_TWITTER_API_SECRET',
  'MOVISVAMI_TWITTER_ACCESS_TOKEN',
  'MOVISVAMI_TWITTER_ACCESS_TOKEN_SECRET',
  'MOVISVAMI_LINKEDIN_ACCESS_TOKEN',
  'MOVISVAMI_LINKEDIN_PERSON_URN',
  'MOVISVAMI_WORDPRESS_SITE_ID',
  'MOVISVAMI_WORDPRESS_USERNAME',
  'MOVISVAMI_WORDPRESS_APP_PASSWORD',
] as const;
