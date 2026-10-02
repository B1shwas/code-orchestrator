export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  swagger: {
    enabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
    path: process.env.SWAGGER_PATH ?? 'docs',
    title: process.env.SWAGGER_TITLE ?? 'WhyCODE API',
    description:
      process.env.SWAGGER_DESCRIPTION ??
      'Production-grade NestJS API (WhyCODE)',
    version: process.env.SWAGGER_VERSION ?? '1.0',
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL ?? '',
    scope: process.env.GITHUB_SCOPE ?? 'read:user user:email repo',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  tokens: {
    encryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  },
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'gemini',
    apiKey: process.env.LLM_API_KEY ?? '',
    model: process.env.LLM_MODEL ?? 'gemini-2.5-flash',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS ?? '60000', 10),
  },
  repos: {
    basePath: process.env.REPOS_BASE_PATH ?? './data/repos',
    cloneTimeoutMs: parseInt(process.env.GIT_CLONE_TIMEOUT_MS ?? '120000', 10),
  },
  analysis: {
    maxTreeDepth: parseInt(process.env.ANALYSIS_MAX_TREE_DEPTH ?? '5', 10),
    maxTreeEntries: parseInt(
      process.env.ANALYSIS_MAX_TREE_ENTRIES ?? '200',
      10,
    ),
    maxFileBytes: parseInt(process.env.ANALYSIS_MAX_FILE_BYTES ?? '262144', 10),
    hardMaxBytes: parseInt(
      process.env.ANALYSIS_HARD_MAX_BYTES ?? '10485760',
      10,
    ),
    searchTimeoutMs: parseInt(
      process.env.ANALYSIS_SEARCH_TIMEOUT_MS ?? '15000',
      10,
    ),
    maxSearchResults: parseInt(
      process.env.ANALYSIS_MAX_SEARCH_RESULTS ?? '100',
      10,
    ),
  },
});
