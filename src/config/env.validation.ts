import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGIN: Joi.string().default('*'),
  RATE_LIMIT_TTL: Joi.number().default(60000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required()
    .description(
      'Postgres connection string, e.g. postgresql://user:password@localhost:5432/whycode?schema=public',
    ),
  SHADOW_DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .allow('')
    .optional()
    .description(
      'Scratch DB for `prisma migrate diff/dev` planning only; never used at runtime',
    ),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SWAGGER_PATH: Joi.string().default('docs'),
  SWAGGER_TITLE: Joi.string().default('WhyCODE API'),
  SWAGGER_DESCRIPTION: Joi.string()
    .allow('')
    .default('Production-grade NestJS API (WhyCODE)'),
  SWAGGER_VERSION: Joi.string().default('1.0'),
  GITHUB_CLIENT_ID: Joi.string().required(),
  GITHUB_CLIENT_SECRET: Joi.string().required(),
  GITHUB_CALLBACK_URL: Joi.string().uri().required(),
  GITHUB_SCOPE: Joi.string().default('read:user user:email repo'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  TOKEN_ENCRYPTION_KEY: Joi.string()
    .length(64)
    .hex()
    .required()
    .description('32-byte hex key for AES-256-GCM token encryption'),
  REPOS_BASE_PATH: Joi.string().default('./data/repos'),
  GIT_CLONE_TIMEOUT_MS: Joi.number().default(600000),
  MAX_REPO_BYTES: Joi.number().default(2147483648),
  ANALYSIS_MAX_TREE_DEPTH: Joi.number().default(5),
  ANALYSIS_MAX_TREE_ENTRIES: Joi.number().default(200),
  ANALYSIS_MAX_FILE_BYTES: Joi.number().default(262144),
  ANALYSIS_HARD_MAX_BYTES: Joi.number().default(10485760),
  ANALYSIS_SEARCH_TIMEOUT_MS: Joi.number().default(15000),
  ANALYSIS_MAX_SEARCH_RESULTS: Joi.number().default(100),
  LLM_PROVIDER: Joi.string().default('gemini'),
  LLM_API_KEY: Joi.string()
    .allow('')
    .default('')
    .description(
      'LLM API key (e.g. Google AI Studio); empty disables LLM calls',
    ),
  LLM_MODEL: Joi.string().default('gemini-2.5-flash'),
  LLM_TIMEOUT_MS: Joi.number().default(60000),
});

export type EnvVariables = {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  API_PREFIX: string;
  CORS_ORIGIN: string;
  RATE_LIMIT_TTL: number;
  RATE_LIMIT_MAX: number;
  DATABASE_URL: string;
  SHADOW_DATABASE_URL?: string;
  SWAGGER_ENABLED: boolean;
  SWAGGER_PATH: string;
  SWAGGER_TITLE: string;
  SWAGGER_DESCRIPTION: string;
  SWAGGER_VERSION: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_CALLBACK_URL: string;
  GITHUB_SCOPE: string;
  FRONTEND_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  TOKEN_ENCRYPTION_KEY: string;
  LLM_PROVIDER: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  LLM_TIMEOUT_MS: number;
  REPOS_BASE_PATH: string;
  GIT_CLONE_TIMEOUT_MS: number;
  MAX_REPO_BYTES: number;
  ANALYSIS_MAX_TREE_DEPTH: number;
  ANALYSIS_MAX_TREE_ENTRIES: number;
  ANALYSIS_MAX_FILE_BYTES: number;
  ANALYSIS_HARD_MAX_BYTES: number;
  ANALYSIS_SEARCH_TIMEOUT_MS: number;
  ANALYSIS_MAX_SEARCH_RESULTS: number;
};

export function validateEnv(config: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { error, value } = envValidationSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  return value as EnvVariables & Record<string, unknown>;
}
