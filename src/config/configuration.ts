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
  },
});
