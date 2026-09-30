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
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SWAGGER_PATH: Joi.string().default('docs'),
  SWAGGER_TITLE: Joi.string().default('WhyCODE API'),
  SWAGGER_DESCRIPTION: Joi.string()
    .allow('')
    .default('Production-grade NestJS API (WhyCODE)'),
  SWAGGER_VERSION: Joi.string().default('1.0'),
});

export type EnvVariables = {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  API_PREFIX: string;
  CORS_ORIGIN: string;
  RATE_LIMIT_TTL: number;
  RATE_LIMIT_MAX: number;
  DATABASE_URL: string;
  SWAGGER_ENABLED: boolean;
  SWAGGER_PATH: string;
  SWAGGER_TITLE: string;
  SWAGGER_DESCRIPTION: string;
  SWAGGER_VERSION: string;
};

// Compatible with @nestjs/config v12+ `validate` option
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
